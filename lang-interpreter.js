
// ---- evaluating the AST
// This is before the parsing code, because the parser depends on some of the structures and stuff defined here.

const VT_ANY = debug ? "VT_ANY" : 0; // used only for type-based whatever, not a real value
const VT_NUMBER = debug ? "VT_NUMBER" : 0;
const VT_TENSOR = debug ? "VT_TENSOR" : 1;
const VT_ERROR = debug ? "VT_ERROR" : 2;
const VT_NULL = debug ? "VT_NULL" : 3;
const VT_FUNCTION = debug ? "VT_FUNCTION" : 4;
const VT_STRING = debug ? "VT_STRING" : 5;
const VT_LIST = debug ? "VT_LIST" : 6;

const RT_PRINT = "print";
const RT_GRAPH = "graph";
const RT_PLOT = "plot";

function makeErr(ctx, info) {
    const err = {
        vt: VT_ERROR,
        val: info,
        astNode: ctx.currentNode
    };

    ctx.errors.push(err);

    return err;
}

function vtToString(vt) {
    switch (vt) {
        case VT_NUMBER:
            return "NUMBER";
        case VT_TENSOR:
            return "TENSOR";
        case VT_ERROR:
            return "ERROR";
        case VT_NULL:
            return "NULL";
        case VT_FUNCTION:
            return "FUNCTION";
        case VT_STRING:
            return "STRING";
        case VT_LIST:
            return "LIST";
    }
    return "unknown type " + vt;
}

function evaluateNumber(x) {
    return makeNumber(parseFloat(x.text));
}

const NULL_OBJ = { vt: VT_NULL, astNode: null };
function makeNull() {
    return NULL_OBJ;
}

function makeNumber(n) {
    return {
        vt: VT_NUMBER,
        val: n,
        astNode: null,
        uuid: Math.random() // purely for debugging purposes
    };
}

function makeString(s) {
    return { vt: VT_STRING, val: s, astNode: null };
}

const builtInConstantsMap = {
    PI: makeNumber(Math.PI),
    E: makeNumber(Math.E),
    // golden ratio
    PHI: makeNumber(1.618033988749)
};
const builtInConstants = Object.keys(builtInConstantsMap);

function hasVariable(ctx, name) {
    if (reservedKeywords.includes(name)) return true;
    if (builtInConstants.includes(name)) return true;
    if (ctx.variables.has(name)) return true;

    return false;
}

function getReference(ctx, name) {
    if (typeof name !== "string") {
        throw new Error("You aren't calling getReference right");
    }

    // I dont think we need to do other checks here?

    v = ctx.variables.getRef(ctx, name);
    if (v) {
        return v;
    }

    return null;
}

function getVariable(ctx, name) {
    if (typeof name !== "string") {
        throw new Error("You aren't calling getVariable right");
    }

    let v = builtInConstantsMap[name];
    if (v) {
        return v;
    }

    v = builtinFunctionsMap[name];
    if (v) {
        return v;
    }

    v = ctx.variables.get(ctx, name);
    if (v) {
        return v;
    }

    return null;
}

function evaluateVariable(ctx, x) {
    const name = x.text;
    const variable = getVariable(ctx, name);
    if (variable === null) {
        return makeErr(
            ctx,
            `the variable ${name} hasn't been declared yet. You can do something like ${name} := 2; to declare it.`
        );
    }

    return variable;
}

function copyTensor(a) {
    return {
        vt: VT_TENSOR,
        shape: a.shape.slice(),
        data: a.data.slice()
    };
}

function getMatrixStride(ctx, a, b) {
    let remainderPart = a.shape.length - b.shape.length;
    if (a.shape.length === 1 && b.shape.length === 1 && b.shape[0] === 1) {
        return 1;
    } else if (areSameShape(a.shape.slice(remainderPart), b.shape)) {
        return a.shape.slice(remainderPart).reduce((a, b) => a * b, 1);
    } else {
        return makeErr(ctx, `wrong sizes: [${a.shape}], [${b.shape}]`);
    }
}

function performElementwiseOp(ctx, a, b, op) {
    const stride = getMatrixStride(ctx, a, b);
    if (stride.vt === VT_ERROR) return stride;

    const newTensor = copyTensor(a);

    for (let i = 0; i < a.data.length; i += stride) {
        for (let j = 0; j < b.data.length; j++) {
            newTensor.data[i + j] = op(newTensor.data[i + j], b.data[j]);
        }
    }

    return newTensor;
}

// the function operator(T1, t2) can be found by doing binOpMatrix[t1][t2][operator].
const binOpMatrix = {
    [VT_NUMBER]: {
        [VT_NUMBER]: {
            "+": (ctx, a, b) => makeNumber(a.val + b.val),
            "<": (ctx, a, b) => makeNumber(a.val < b.val ? 1.0 : 0.0),
            ">": (ctx, a, b) => makeNumber(a.val > b.val ? 1.0 : 0.0),
            "<=": (ctx, a, b) => makeNumber(a.val <= b.val ? 1.0 : 0.0),
            ">=": (ctx, a, b) => makeNumber(a.val >= b.val ? 1.0 : 0.0),
            "==": (ctx, a, b) => makeNumber(Math.abs(a.val - b.val) < 0.0000000001 ? 1.0 : 0.0),
            "-": (ctx, a, b) => makeNumber(a.val - b.val),
            "*": (ctx, a, b) => makeNumber(a.val * b.val),
            "/": (ctx, a, b) => makeNumber(a.val / b.val),
            "%": (ctx, a, b) => makeNumber(a.val % b.val),
            "^": (ctx, a, b) => makeNumber(Math.pow(a.val, b.val))
        }
    },
    [VT_TENSOR]: {
        [VT_TENSOR]: {
            "**": (ctx, a, b) => {
                if (a.shape.length === 1 && b.shape.length === 1 && a.shape[0] === b.shape[0]) {
                    let sum = 0;
                    for (let i = 0; i < a.data.length; i++) {
                        sum += a.data[i] * b.data[i];
                    }
                    return makeNumber(sum);
                }

                // matrix multiplication
                let aW = a.shape.length === 1 ? a.shape[0] : a.shape[1];
                let bW = b.shape.length === 0 ? 1 : b.shape[1] || 1;
                let aH = a.shape.length === 1 ? 1 : a.shape[0];
                let bH = b.shape.length === 1 ? b.shape[0] : b.shape[0];

                if (a.shape.length > 2 || b.shape.length > 2) {
                    return makeErr(ctx, `matrix multiplication only works with matrices/vectors for now`);
                }
                if (aW !== bH) {
                    return makeErr(
                        ctx,
                        `second matrix row count (${bH}) must equal first matrix column count ${aW}`
                    );
                }

                const newData = Array(bW * aH);

                for (let i = 0; i < bW; i++) {
                    for (let j = 0; j < aH; j++) {
                        let dotP = 0;
                        for (let k = 0; k < bH; k++) {
                            dotP += a.data[k + j * aW] * b.data[i + k * bW];
                        }
                        newData[i + j * bW] = dotP;
                    }
                }

                return {
                    vt: VT_TENSOR,
                    data: newData,
                    shape: [bW, aH]
                };
            },

            "<": (ctx, a, b) => performElementwiseOp(ctx, a, b, (a, b) => (a < b ? 1.0 : 0.0)),
            ">": (ctx, a, b) => performElementwiseOp(ctx, a, b, (a, b) => (a > b ? 1.0 : 0.0)),
            "<=": (ctx, a, b) => performElementwiseOp(ctx, a, b, (a, b) => (a <= b ? 1.0 : 0.0)),
            ">=": (ctx, a, b) => performElementwiseOp(ctx, a, b, (a, b) => (a >= b ? 1.0 : 0.0)),
            "==": (ctx, a, b) =>
                performElementwiseOp(ctx, a, b, (a, b) => (Math.abs(a - b) > 0.0000000001 ? 1.0 : 0.0)),
            "+": (ctx, a, b) => performElementwiseOp(ctx, a, b, (a, b) => a + b),
            "-": (ctx, a, b) => performElementwiseOp(ctx, a, b, (a, b) => a - b),
            "*": (ctx, a, b) => performElementwiseOp(ctx, a, b, (a, b) => a * b),
            "/": (ctx, a, b) => performElementwiseOp(ctx, a, b, (a, b) => a / b),
            "%": (ctx, a, b) => performElementwiseOp(ctx, a, b, (a, b) => a % b),
            "^": (ctx, a, b) => performElementwiseOp(ctx, a, b, (a, b) => Math.pow(a, b))
        }
    },
    [VT_STRING]: {
        [VT_STRING]: {
            "+": (ctx, a, b) => ({ vt: a.vt, val: a.val + b.val })
        }
    },
    [VT_LIST]: {
        // these mutate directly
        [VT_ANY]: {
            "+": (ctx, a, b) => {
                a.items.push(b);
                return a;
            }
        }
    }
};

function applyOperator(ctx, lhs, rhs, op) {
    const t1 = lhs.vt;
    const t2 = rhs.vt;

    let binOp = null,
        binOpL1 = null,
        binOpL2 = null;
    binOpL1 = binOpMatrix[t1] || binOpMatrix[VT_ANY];

    if (binOpL1) {
        binOpL2 = binOpL1[t2] || binOpL1[VT_ANY];
        if (binOpL2) {
            binOp = binOpL2[op.text];
        }
    }

    if (!binOp) {
        return makeErr(
            ctx,
            `the operation ${vtToString(t1)} ${op.text} ${vtToString(t2)} doesn't exist yet` +
                ((t1 === VT_TENSOR && t2 === VT_NUMBER) || (t2 === VT_TENSOR && t1 === VT_NUMBER)
                    ? " (hint: for now you have to put [] around the number)"
                    : "")
        );
    }

    return binOp(ctx, lhs, rhs);
}

function evaluateChain(ctx, x) {
    let val = evaluateExpression(ctx, x.termsAndOps[0]);
    if (val.vt === VT_ERROR) {
        return val;
    }

    for (let i = 2; i < x.termsAndOps.length; i += 2) {
        const val2 = evaluateExpression(ctx, x.termsAndOps[i]);
        if (val2.vt === VT_ERROR) {
            return val;
        }

        val = applyOperator(ctx, val, val2, x.termsAndOps[i - 1]);
        if (val === VT_ERROR) {
            throw "what";
        }
    }
    return val;
}

const unaryOpsMap = {
    [VT_NUMBER]: {
        "+": (ctx, x) => x,
        "-": (ctx, x) => ({ vt: x.vt, val: -x.val })
    },
    [VT_TENSOR]: {
        "-": (ctx, x) => {
            const tensor = copyTensor(x);
            for (let i = 0; i < tensor.data.length; i++) {
                tensor.data[i] = -tensor.data[i];
            }
            return tensor;
        },
        "~": (ctx, x) => {
            if (x.shape.length > 2) {
                // I don't have the math knowledge required to make this work for tensors,
                // nor do I have a use case beyond matrices, so I shouldn't waste my time on getting this to work
                return makeErr(
                    ctx,
                    `transposing is only defined on matrices and vectors at the moment (tensors with 1 or 2 shape components)`
                );
            }

            const tensor = copyTensor(x);

            if (x.shape.length === 1) {
                tensor.shape = [1, tensor.shape];
                return tensor;
            }

            // Even though you may be used to seeing width followed by height everywhere, w, h is the correct reverse order here.
            let w = x.shape[1];
            let h = x.shape[0];
            tensor.shape = [w, h];
            for (let i = 0; i < w; i++) {
                for (let j = 0; j < h; j++) {
                    tensor.data[i * h + j] = x.data[i + j * w];
                }
            }

            return tensor;
        }
    }
};
const unaryOps = [];
for (const typeKey in unaryOpsMap) {
    const opList = unaryOpsMap[typeKey];
    for (const op in opList) {
        unaryOps.push(op);
    }
}

function evaluateUnaryExpr(ctx, x) {
    const val = evaluateExpression(ctx, x.expr);
    if (val.vt === VT_ERROR) {
        return val;
    }

    const func = unaryOpsMap[val.vt][x.op.text];
    if (!func) {
        return makeErr(ctx, `unary op ${x.op.text} can't be used on ${vtToString(val.vt)}`);
    }

    return func(ctx, val);
}

function getVals(args) {
    return args.map((v) => v.val);
}

// imagine building an interpreted language in an interpreted language

// these args are nowhere near enough to capture the way arguments are specified into these functions.
// Some of these builtin math functions take two floats, I was just not bothered to update the args arrays.
// Some of the methods also take variadic arguments.
// Some of the methods also want a list of things, followed by some normal arguments.
//      e.g graph(...listOfFunctions, domainStart, domainEnd);
// Some of the methods also can take an 'any' type, or some particular combination of types for an argument.
// we basically need to implement a little regex-like function to validate the input of types given some validation object. (that is, if we don't want to manually write type validation code per-function)
// this is not a priority at the moment, so the argument input checking will be lacking for now (and probably forever, until I make it in Rust)
// now that I think about it, this language is a super good use-case for Rust+web-assembly. I will consider it
const builtinFunctionsMap = {
    abs: {
        args: [{ vt: VT_NUMBER }],
        fn: (ctx, ...args) => makeNumber(Math.abs(...getVals(args)))
    },
    acos: {
        args: [{ vt: VT_NUMBER }],
        fn: (ctx, ...args) => makeNumber(Math.acos(...getVals(args)))
    },
    acosh: {
        args: [{ vt: VT_NUMBER }],
        fn: (ctx, ...args) => makeNumber(Math.acosh(...getVals(args)))
    },
    asin: {
        args: [{ vt: VT_NUMBER }],
        fn: (ctx, ...args) => makeNumber(Math.asin(...getVals(args)))
    },
    asinh: {
        args: [{ vt: VT_NUMBER }],
        fn: (ctx, ...args) => makeNumber(Math.asinh(...getVals(args)))
    },
    atan: {
        args: [{ vt: VT_NUMBER }],
        fn: (ctx, ...args) => makeNumber(Math.atan(...getVals(args)))
    },
    atanh: {
        args: [{ vt: VT_NUMBER }],
        fn: (ctx, ...args) => makeNumber(Math.atanh(...getVals(args)))
    },
    atan2: {
        args: [{ vt: VT_NUMBER }, { vt: VT_NUMBER }],
        fn: (ctx, ...args) => makeNumber(Math.atan2(...getVals(args)))
    },
    ceil: {
        args: [{ vt: VT_NUMBER }],
        fn: (ctx, ...args) => makeNumber(Math.ceil(...getVals(args)))
    },
    cos: {
        args: [{ vt: VT_NUMBER }],
        fn: (ctx, ...args) => makeNumber(Math.cos(...getVals(args)))
    },
    cosh: {
        args: [{ vt: VT_NUMBER }],
        fn: (ctx, ...args) => makeNumber(Math.cosh(...getVals(args)))
    },
    exp: {
        args: [{ vt: VT_NUMBER }],
        fn: (ctx, ...args) => makeNumber(Math.exp(...getVals(args)))
    },
    floor: {
        args: [{ vt: VT_NUMBER }],
        fn: (ctx, ...args) => makeNumber(Math.floor(...getVals(args)))
    },
    hypot: {
        args: [{ vt: VT_NUMBER }],
        fn: (ctx, ...args) => makeNumber(Math.hypot(...getVals(args)))
    },
    imul: {
        args: [{ vt: VT_NUMBER }],
        fn: (ctx, ...args) => makeNumber(Math.imul(...getVals(args)))
    },
    log: {
        args: [{ vt: VT_NUMBER }],
        fn: (ctx, ...args) => makeNumber(Math.log(...getVals(args)))
    },
    log1p: {
        args: [{ vt: VT_NUMBER }],
        fn: (ctx, ...args) => makeNumber(Math.log1p(...getVals(args)))
    },
    log10: {
        args: [{ vt: VT_NUMBER }],
        fn: (ctx, ...args) => makeNumber(Math.log10(...getVals(args)))
    },
    log2: {
        args: [{ vt: VT_NUMBER }],
        fn: (ctx, ...args) => makeNumber(Math.log2(...getVals(args)))
    },
    max: {
        args: [{ vt: VT_NUMBER }],
        fn: (ctx, ...args) => makeNumber(Math.max(...getVals(args)))
    },
    min: {
        args: [{ vt: VT_NUMBER }],
        fn: (ctx, ...args) => makeNumber(Math.min(...getVals(args)))
    },
    pow: {
        args: [{ vt: VT_NUMBER }, { vt: VT_NUMBER }],
        fn: (ctx, ...args) => makeNumber(Math.pow(...getVals(args)))
    },
    random: {
        args: [{ vt: VT_NUMBER }],
        fn: (ctx, ...args) => makeNumber(Math.random(...getVals(args)))
    },
    round: {
        args: [{ vt: VT_NUMBER }],
        fn: (ctx, ...args) => makeNumber(Math.round(...getVals(args)))
    },
    sign: {
        args: [{ vt: VT_NUMBER }],
        fn: (ctx, ...args) => makeNumber(Math.sign(...getVals(args)))
    },
    sin: {
        args: [{ vt: VT_NUMBER }],
        fn: (ctx, ...args) => makeNumber(Math.sin(...getVals(args)))
    },
    sinh: {
        args: [{ vt: VT_NUMBER }],
        fn: (ctx, ...args) => makeNumber(Math.sinh(...getVals(args)))
    },
    sqrt: {
        args: [{ vt: VT_NUMBER }],
        fn: (ctx, ...args) => makeNumber(Math.sqrt(...getVals(args)))
    },
    tan: {
        args: [{ vt: VT_NUMBER }],
        fn: (ctx, ...args) => makeNumber(Math.tan(...getVals(args)))
    },
    tanh: {
        args: [{ vt: VT_NUMBER }],
        fn: (ctx, ...args) => makeNumber(Math.tanh(...getVals(args)))
    },
    trunc: {
        args: [{ vt: VT_NUMBER }],
        fn: (ctx, ...args) => makeNumber(Math.trunc(...getVals(args)))
    },
    // ---- builtins I had to write myself

    T: {
        args: [{ vt: VT_NUMBER }],
        fn: (ctx, ...args) => ({
            vt: VT_TENSOR,
            data: Array(args.map((x) => x.val).reduce((prev, next) => prev * next, 1)).fill(0),
            shape: args.map((x) => x.val)
        }) // no error checks? TODO: add. later, of
    },
    I: {
        args: [{ vt: VT_NUMBER }],
        fn: (ctx, size) => {
            const tensor = builtinFunctionsMap.T.fn(ctx, size, size);
            for (let i = 0; i < size.val; i++) {
                tensor.data[i + size.val * i] = 1;
            }
            return tensor;
        }
    },
    lerp: {
        args: [{ vt: VT_NUMBER }],
        fn: (ctx, ...args) => makeNumber(lerp(...getVals(args)))
    },
    toVec: {
        args: [{ vt: VT_LIST }],
        fn: (ctx, list) => {
            for (let i = 0; i < list.items.length; i++) {
                if (list.items[i].vt !== VT_NUMBER) {
                    return makeErr(`all items in the list must be of type ` + vtToString(VT_NUMBER));
                }
            }

            let arr = Array(list.items.length);
            for (let i = 0; i < list.items.length; i++) {
                arr[i] = list.items[i].val;
            }

            return {
                vt: VT_TENSOR,
                data: arr,
                shape: [arr.length]
            };
        }
    },
    len: {
        args: [],
        fn: (ctx, x) => {
            if (x.vt === VT_LIST) return makeNumber(x.items.length);
            if (x.vt === VT_TENSOR) return makeNumber(x.shape[0]);
            if (x.vt === VT_STRING) return makeNumber(x.val.length);
            return makeErr(ctx, `can't take the length of type ${vtToString(x.vt)}`);
        }
    },

    // prints a number of minutes as hours and minutes.
    toHm: {
        args: [{ vt: VT_NUMBER }],
        fn: (ctx, v) => makeString(`${Math.floor(v.val / 60)}h ${v.val % 60}m`)
    },
    dot: {
        args: [{ vt: VT_TENSOR }, { vt: VT_TENSOR }],
        fn: (ctx, a, b) => {
            if (!areSameShape(a.shape, b.shape)) {
                return makeErr(ctx, `two tensors must have the same shape for a dot product`);
            }

            let sum = 0;
            for (let i = 0; i < a.data.length; i++) {
                sum += a.data[i] + b.data[i];
            }
            return makeNumber(sum);
        }
    },

    // output functions
    print: {
        args: [],
        fn: (ctx, thing, title) => {
            ctx.results.push({
                rt: RT_PRINT,
                val: { ...thing },
                title:
                    (title && title.val) ||
                    (thing.astNode && thing.astNode.t === T_IDENT && thing.astNode.text)
            });
            return makeNull();
        }
    },
    graph: {
        args: [],
        fn: (ctx, ...args) => {
            let functions = [];
            let i = 0;
            if (args[i].vt === VT_LIST) {
                args = [...args[i].items, ...args.slice(1)];
            }

            for (; i < args.length; i++) {
                if (args[i].vt !== VT_FUNCTION) break;
                if (args[i].args.length !== 1)
                    return makeErr(
                        ctx,
                        `a function can only have 1 argument to be graphable, for now at least`
                    );
                functions.push(args[i]);
            }

            if (functions.length === 0) {
                return makeErr(ctx, `arguments to graph are like ...functions, domainStart, domainEnd`);
            }
            if (i !== args.length - 2) {
                return makeErr(ctx, `specify the start and end after the list of functions. eg: graph(f(x) := x, 0, 1)`);
            }

            ctx.results.push({
                rt: RT_GRAPH,
                functions: functions,
                start: args[i],
                end: args[i + 1]
            });
            return makeNull();
        }
    },
    plot: {
        args: [],
        fn: (ctx, ...args) => {
            let lines = [];
            let i = 0;
            if (args[i].vt === VT_LIST) {
                args = [...args[i].items];
            }

            for (; i < args.length; i++) {
                if (
                    (args[i].vt !== VT_TENSOR) ||
                    (args[i].shape[args[i].shape.length - 1] !== 2) ||
                    (args[i].shape.length !== 2)
                ) {
                    return makeErr(ctx, `can only plot lists of 2D vectors`);
                }
            }

            ctx.results.push({
                rt: RT_PLOT,
                lists: args
            });
            return makeNull();
        }
    }
};
const builtinFunctions = Object.keys(builtinFunctionsMap);

function evaluateUserDefFunctionCall(ctx, x, name) {
    const func = ctx.variables.get(ctx, name);
    if (!func) {
        return makeErr(ctx, `function '${name}' not found`);
    }
    if (func.vt !== VT_FUNCTION) {
        return makeErr(ctx, `'${name}' is not a function that can be called`);
    }

    if (x.args.length !== func.args.length) {
        return makeErr(
            ctx,
            `user defined function ${name} wants ${func.args.length} arguments, only ${x.args.length} were provided`
        );
    }

    const argumentNames = func.args;
    const argumentValues = x.args;

    ctx.variables.pushStackFrame();

    // set arguments to values
    for (let i = 0; i < argumentNames.length; i++) {
        const val = evaluateExpression(ctx, argumentValues[i]);
        if (val.vt === VT_ERROR) {
            return val;
        }
        ctx.variables.set(ctx, argumentNames[i], val, ASSIGN_DECLARE);
    }

    // set captures to values
    for (let i = 0; i < func.captures.length; i++) {
        ctx.variables.set(ctx, func.captures[i][0], func.captures[i][1], ASSIGN_DECLARE, true);
    }

    const val = evaluateBlock(ctx, func.body);

    ctx.variables.popStackFrame();

    return val;
}

function evaluateExprArray(ctx, exprs) {
    const argsEvaluated = Array(exprs.length);
    for (let i = 0; i < exprs.length; i++) {
        const val = evaluateExpression(ctx, exprs[i]);
        if (val.vt === VT_ERROR) {
            return val;
        }
        argsEvaluated[i] = val;
    }

    return argsEvaluated;
}

function evaluateFunctionCall(ctx, x) {
    const name = x.name.text;
    const func = builtinFunctionsMap[name];
    if (!func) {
        // user defined funciton
        return evaluateUserDefFunctionCall(ctx, x, name);
    }

    const argsEvaluated = evaluateExprArray(ctx, x.args);
    if (argsEvaluated.vt === VT_ERROR) {
        return argsEvaluated;
    }

    // I don't care if the argument counts don't match at the moment.
    // some of the javascript math functions might accept variadic ...args,
    // and it is more important that I am able to use that than it is that I get errors about argument counts
    // at the moment.

    for (let i = 0; i < func.args.length; i++) {
        if (argsEvaluated[i].vt !== func.args[i].vt) {
            if (argsEvaluated[i].vt === VT_ERROR) {
                return argsEvaluated[i];
            }

            return makeErr(
                ctx,
                `Argument ${i} to function ${name} was of type ${vtToString(
                    argsEvaluated[i].vt
                )}, but it wants ${vtToString(func.args[i].vt)}`
            );
        }
    }

    return func.fn(ctx, ...argsEvaluated);
}

function evaluateFunctionAssignment(ctx, x) {
    const fn = x.lhs;
    const functionName = fn.name.text;
    let argNames = Array(fn.args.length);
    for (let i = 0; i < fn.args.length; i++) {
        if (fn.args[i].t !== T_IDENT) {
            return makeErr(
                `declaration of function ${functionName} accepts an invalid variable: '${nodeText(
                    ctx,
                    fn.args[i]
                )}' (hint: variable names have no spaces or punctuation, and don't start with numbers)`
            );
        }

        argNames[i] = fn.args[i].text;
    }

    const body =
        x.rhs.t === T_BLOCK
            ? x.rhs
            : {
                  t: T_BLOCK,
                  start: x.rhs.start,
                  end: x.rhs.end,
                  body: [x.rhs]
              };

    // our function may also be referencing variables outside of itself.
    // in that case, we need to capture their values as they are now, and then use them when we call
    // the function again later with the given arguments.
    // I believe this will make the most sense in the most cases. Except when they point to references, which may or may not
    // be in scope. hmm. certainly modifying a value would be questionable. it would affect how the other functions are called,
    // because they may also be referencing the same thing.
    // I wonder if this can be used to interesting effect though

    // array of pairs like [[name, val], ...]
    const captures = [];

    // not accurate, but I can't easily simulate the stack accurately at the moment.
    // The point of this is so we don't attempt to capture variables that aren't actually captures.
    // The next time I design a language, I will hyper-focus on closures, as they are apparently very hard
    // to get right without planning
    const virtualScopeStack = new Set();
    const dfs = (node) => {
        if (typeof node === "string" || node === null || node === undefined) {
            return;
        }
        if (typeof node !== "object") {
            return;
        }

        if (node.t === T_IDENT) {
            const varName = node.text;

            // This identifier is probably referring to one of this function's arguments.
            if (argNames.includes(varName)) return;

            // we have already captured this variable
            if (captures.find((x) => x[0] === varName)) return;

            // its a builtin constant
            if (varName in builtInConstantsMap) return;

            // its a builtin function
            if (varName in builtinFunctionsMap) return;

            // its a thing we declared within this function itself.
            if (virtualScopeStack.has(varName)) return;

            const capturedVarRef = getReference(ctx, varName);
            if (capturedVarRef === null) {
                // return makeErr(ctx, `Could not find captured variable '${varName}' for function ${functionName}`)
                return;
            }

            // this is a reference and not a copy !!!
            captures.push([varName, capturedVarRef])

            return;
        }

        let isAssignNode = node.t === T_ASSIGNMENT &&
            node.assignType === ASSIGN_DECLARE &&
            node.lhs.t === T_IDENT;
        let assignVarName = isAssignNode ? node.lhs.text : "";
        if (isAssignNode) {
            virtualScopeStack.add(assignVarName);
        }

        for (const k of Object.keys(node)) {
            if (node.t === T_ASSIGNMENT && 
                k === "lhs" && 
                node.assignType === ASSIGN_DECLARE) {
                // variable assignment left-hand-sides should be ignored.
                continue;
            }

            dfs(node[k]);
        }

        if (isAssignNode) {
            virtualScopeStack.delete(assignVarName);
        }
    };

    console.log("Captures", captures);

    dfs(x.rhs);

    const func = {
        vt: VT_FUNCTION,
        args: argNames,
        captures: captures,
        randomNumber: Math.random(),
        body: body,
        text: nodeText(ctx, x),
        name: functionName
    };

    ctx.variables.set(ctx, functionName, func, x.assignType);

    return func;
}

// TODO: split up function to variable assignment, indexation assignment and function assignment
function evaluateAssignment(ctx, x) {
    let varName = null;
    let isIndexation = false;
    if (x.lhs.t === T_FUNCTION_CALL) {
        return evaluateFunctionAssignment(ctx, x);
    }

    if (x.lhs.t === T_IDENT) {
        varName = x.lhs.text;
    } else if (x.lhs.t === T_EXPR_INDEXATION && x.lhs.expr.t === T_IDENT) {
        varName = x.lhs.expr.text;
        isIndexation = true;
    } else {
        return makeErr(ctx, `can't assign to lhs type ${x.lhs.t}`);
    }

    // check if variable can be assigned to
    if (!varName) {
        return makeErr(ctx, `identifier was blank`);
    }
    if (builtinFunctions.includes(varName)) {
        return makeErr(
            ctx,
            Math.random() < 0.05
                ? `NOO!!! you cant just redeclare functions !!!`
                : `a builtin function already exists with this name`
        );
    }

    const rhs = evaluateExpression(ctx, x.rhs);
    if (rhs.vt === VT_ERROR) {
        return rhs;
    }
    const existingVar = getVariable(ctx, varName);

    if (isIndexation) {
        if (x.assignType === ASSIGN_DECLARE) {
            return makeErr(
                ctx,
                `${ctx.text.substring(
                    x.start,
                    x.end
                )} - can't declare a new variable inside a thing, doesn't make sense conceptually (hint: just use '=')`
            );
        }
    }
    // assignType will always be not be ASSIGN_DECLARE when isIndexation is true from here on

    if (isIndexation) {
        if (x.assignType === ASSIGN_DECLARE) {
            return makeErr(
                ctx,
                `can't declare a new variable inside a tensor, doesn't make sense conceptually (hint: just use '=')`
            );
        }

        // we are going to set the values directly in the tensor
        const tensor = existingVar;

        const indexes = evaluateExprArray(ctx, x.lhs.indexes);
        if (indexes.vt === VT_ERROR) {
            return indexes;
        }

        const [flattenedIndices, remainingShape, err] = evaluateIndicesToFlatArray(
            ctx,
            x,
            tensor.shape,
            indexes
        );
        if (err !== null) {
            return err;
        }

        // the thing we're assigning to should have the same shape (at some level at least)
        if (remainingShape.length === 0) {
            if (rhs.vt === VT_TENSOR) {
                if (flattenedIndices.length !== rhs.data.length) {
                    return makeErr(
                        ctx,
                        `rhs of ${nodeText(ctx, x)} needs the same number of elements as indices (${
                            flattenedIndices.length
                        }), instead ${rhs.data.length} were provided`
                    );
                }

                for (let i = 0; i < flattenedIndices.length; i++) {
                    tensor.data[flattenedIndices[i]] = rhs.data[i];
                }
            } else if (rhs.vt === VT_NUMBER) {
                for (let i = 0; i < flattenedIndices.length; i++) {
                    tensor.data[flattenedIndices[i]] = rhs.val;
                }
            } else {
                return makeErr(ctx, `rhs must be a number or tensor`);
            }
        } else {
            if (rhs.vt !== VT_TENSOR) {
                return makeErr(ctx, `rhs must be a tensor`);
            }

            if (!areSameShape(rhs.shape, remainingShape)) {
                return makeErr(ctx, `rhs must be a tensor with shape ` + remainingShape.join("x"));
            }

            // we can do this, because rhs is the same shape as the remaining tensor
            for (let i = 0; i < flattenedIndices.length; i++) {
                for (let j = 0; j < rhs.data.length; j++) {
                    tensor.data[flattenedIndices[i] + j] = rhs.data[j];
                }
            }
        }

        return rhs;
    }

    let setError = ctx.variables.set(ctx, varName, rhs, x.assignType);
    if (setError !== null) {
        return setError;
    }

    return rhs;
}

function isTrue(x) {
    return x.vt === VT_NUMBER && x.val >= 0.5;
}

function evaluateTernary(ctx, x) {
    const condition = evaluateExpression(ctx, x.conditional);
    if (condition.vt === VT_ERROR) {
        return condition.vt;
    }

    if (condition.vt !== VT_NUMBER) {
        return makeErr(
            ctx,
            `condition needs to be a number, anything less than 0.5 is false, anything >= 0.5 is true`
        );
    }

    if (isTrue(condition)) {
        return evaluateExpression(ctx, x.ifTrue);
    }

    return evaluateExpression(ctx, x.else);
}

// takes in two shapes, not two tensors
function areSameShape(s1, s2) {
    if (s1.length !== s2.length) return false;

    for (const i in s1) {
        if (s1[i] !== s2[i]) return false;
    }

    return true;
}

function nodeText(ctx, node) {
    return ctx.text.substring(node.start, node.end).trim();
}

function evaluateTensor(ctx, x) {
    if (x.rows.length === 0) {
        return makeErr(ctx, `can't have a zero-length vector`);
    }

    const depthFirstEvalTensor = (x) => {
        if (x.t !== T_TENSOR) {
            const val = evaluateExpression(ctx, x);
            if (val.vt === VT_ERROR) {
                return val;
            }

            if (val.vt === VT_NUMBER || val.vt === VT_TENSOR) {
                return val;
            }

            return makeErr(
                ctx,
                `bottom level item ${nodeText(ctx, x)} in tensor not of correct type - ${vtToString(val.vt)}`
            );
        }

        const tensor = {
            vt: VT_TENSOR,
            data: [],
            shape: []
        };

        let expectedShape = null;
        for (let i = 0; i < x.rows.length; i++) {
            let row = depthFirstEvalTensor(x.rows[i]);
            if (row.vt === VT_ERROR) {
                return row;
            }

            if (row.vt === VT_TENSOR) {
                if (expectedShape === null) {
                    expectedShape = row.shape;
                } else if (!areSameShape(expectedShape, row.shape)) {
                    return makeErr(
                        ctx,
                        `one of the elements of the tensor was the wrong size: ${nodeText(ctx, x.rows[i])}`
                    );
                }

                tensor.data.push(...row.data);
            } else if (row.vt === VT_NUMBER) {
                expectedShape = [];
                tensor.data.push(row.val);
            }
        }

        tensor.shape = [x.rows.length, ...expectedShape];

        return tensor;
    };

    const tensor = depthFirstEvalTensor(x);

    return tensor;
}

function evaluateIndicesToFlatArray(ctx, errorNode, shape, indexes) {
    const strides = Array(shape.length);

    // at each level, we should know how big the stride is.
    // we calculate this with a cumulative sum. at the lowest level, the stride is 1.
    // if we have a 2x3 matrix, the things would be [6, 3, 1], with 6 being the total number of things in
    // the entire matrix and hence not very useful
    strides[strides.length - 1] = 1;
    for (let i = shape.length - 2; i >= 0; i--) {
        strides[i] = shape[i + 1] * strides[i + 1];
    }

    // now, we have some indices that need to become a list of indexes.
    // if we have [1,2,3][1], then 1 is the index.
    // if we have [1,2,3][[1, 2]], then we really want 2 indices - 1 and 2.
    // [[1,2,3],[4,5,6]][1][0] -> 3 + 0
    // [[1,2,3],[4,5,6]][[0, 1]][0] -> [0 + 0, 3 + 0]
    const flatIndexes = [0];
    let i = 0;
    while (i < indexes.length) {
        // incrementing i is done on a type by type basis. it is basically the current 'dimension'
        const idx = indexes[i];
        if (idx.vt === VT_NUMBER) {
            for (let j = 0; j < flatIndexes.length; j++) {
                if (idx.val < 0 || idx.val >= shape[i]) {
                    return [
                        null,
                        null,
                        makeErr(ctx, `index ${idx.val} in ${nodeText(ctx, errorNode)} was out of bounds`)
                    ];
                }

                flatIndexes[j] += strides[i] * idx.val;
            }
            i++;
        } else if (idx.vt === VT_TENSOR) {
            let isListOfVectors = idx.shape.length === 2;
            let isListOfNumbers = idx.shape.length === 1;
            if (!isListOfNumbers && !isListOfVectors) {
                return [
                    null,
                    null,
                    makeErr(
                        ctx,
                        `only numbers, lists of numbers, or lists of vectors can be used as indices. \n\t(Note that this doesn't include vectors, as they can be misconstrued as a list of numbers. You will need to wrap your vector in a list)`
                    )
                ];
            }

            // copy the indices we already have for each index specified
            let originalLen = flatIndexes.length;
            let numIndices = isListOfNumbers ? idx.data.length : idx.shape[0];
            for (let j = 0; j < numIndices - 1; j++) {
                flatIndexes.push(...flatIndexes.slice(0, originalLen));
            }

            if (isListOfNumbers) {
                for (let j = 0; j < numIndices; j++) {
                    // bounds check
                    if (idx.data[j] < 0 || idx.data[j] >= shape[i]) {
                        return [
                            null,
                            null,
                            makeErr(
                                ctx,
                                `index ${idx.data[j]} in ${nodeText(ctx, errorNode)} was out of bounds`
                            )
                        ];
                    }

                    // TODO: better comment
                    // increment the index by the current dimension
                    for (let k = 0; k < originalLen; k++) {
                        flatIndexes[j * originalLen + k] += strides[i] * idx.data[j];
                    }
                }
                i++;
            } else {
                const vecSize = idx.shape[1];
                if (i + vecSize > shape.length) {
                    return [
                        null,
                        null,
                        makeErr(
                            ctx,
                            `the indexing part of ${nodeText(ctx, errorNode)} has too many dimensions`
                        )
                    ];
                }

                for (let j = 0; j < numIndices; j++) {
                    for (let k = 0; k < originalLen; k++) {
                        // we have a point or something, we need to advance the dimension by the length of this thing at the end
                        for (let dimOffset = 0; dimOffset < vecSize; dimOffset++) {
                            // bounds check
                            if (idx.data[j] < 0 || idx.data[j] >= shape[i]) {
                                return [
                                    null,
                                    null,
                                    makeErr(
                                        ctx,
                                        `index ${idx.data[j]} in ${nodeText(
                                            ctx,
                                            errorNode
                                        )} was out of bounds`
                                    )
                                ];
                            }
                        }

                        for (let dimOffset = 0; dimOffset < vecSize; dimOffset++) {
                            flatIndexes[j * originalLen + k] +=
                                strides[i + dimOffset] * idx.data[j * vecSize + dimOffset];
                        }
                    }
                }

                i += vecSize;
            }
        } else {
            return [null, null, makeErr(ctx, `tf kinda type is this huh: ${vtToString(idx.vt)}`)];
        }
    }

    return [flatIndexes, shape.slice(i), null];
}

function evaluateIndexation(ctx, x) {
    const expr = evaluateExpression(ctx, x.expr);
    if (expr.vt === VT_ERROR) {
        return expr;
    }

    if (expr.vt !== VT_TENSOR && expr.vt !== VT_LIST) {
        return makeErr(ctx, `the type ${vtToString(expr.vt)} cannot be indexed yet`);
    }

    const indexes = evaluateExprArray(ctx, x.indexes);
    if (indexes.vt === VT_ERROR) {
        return indexes;
    }

    if (expr.vt === VT_LIST) {
        if (indexes.length === 1) {
            return expr.items[Math.floor(indexes[0].val)];
        } else {
            // TODO: extract indexing logic to custom function, call it here
            return makeErr(ctx, `can't index thing inside a thing yet :(`);
        }
    }

    const [flatIndices, remainingShape, err] = evaluateIndicesToFlatArray(ctx, x, expr.shape, indexes);
    if (err !== null) {
        return err;
    }

    if (remainingShape.length === 0) {
        for (let i = 0; i < flatIndices.length; i++) {
            flatIndices[i] = expr.data[flatIndices[i]];
        }

        if (flatIndices.length === 1) {
            return makeNumber(flatIndices[0]);
        }

        return {
            vt: VT_TENSOR,
            shape: [flatIndices.length],
            data: flatIndices
        };
    }

    // note to self: this kind of code is FAR easier to write when in the zone than it is to read,
    // don't be discouraged if you don't understand a word of it. Kinda like regex actually
    const stride = remainingShape.reduce((a, b) => a * b, 1);
    const largerArray = Array(flatIndices.length * stride);
    for (let i = 0; i < flatIndices.length; i++) {
        for (let j = 0; j < stride; j++) {
            largerArray[i * stride + j] = expr.data[flatIndices[i] + j];
        }
    }

    return {
        vt: VT_TENSOR,
        shape: [...remainingShape],
        data: largerArray
    };
}

// this does not push or pop any stack frames, they need to be done by the caller
function evaluateBlock(ctx, x) {
    // it is a custom user defined function.
    // we will just return the final value it calculated.
    // (this could simply by a variable on it's own on a single line, so no problems here)
    let lastStatementResult = makeNull();

    // evaluate function
    for (let i = 0; i < x.body.length; i++) {
        lastStatementResult = evaluateExpression(ctx, x.body[i]);
        if (lastStatementResult.vt === VT_ERROR) {
            return lastStatementResult;
        }
    }

    return lastStatementResult;
}

function evaluateForLoop(ctx, x) {
    ctx.variables.pushStackFrame();

    // initialize loop
    for (let i = 0; i < x.initializers.length; i++) {
        const val = evaluateExpression(ctx, x.initializers[i]);
        if (val.vt === VT_ERROR) {
            return val;
        }
    }

    let maxLoopCount = 1000000,
        safetyCounter = 0;

    // drive loop
    for (
        ;
        safetyCounter < maxLoopCount;
        safetyCounter++ // make sure we can't get any infinite loops even if we want to. I don't know how to allow users to break them yet
    ) {
        // evaluate loop condition
        const val = evaluateExpression(ctx, x.loopCondition);
        if (val.vt === VT_ERROR) {
            return val;
        }

        if (!isTrue(val)) {
            break;
        }

        ctx.variables.pushStackFrame();

        // loop body
        evaluateBlock(ctx, x.loopBody, false);

        ctx.variables.popStackFrame();

        // increment
        for (let i = 0; i < x.iterators.length; i++) {
            const val = evaluateExpression(ctx, x.iterators[i]);
            if (val.vt === VT_ERROR) {
                return val;
            }
        }
    }

    ctx.variables.popStackFrame();

    if (safetyCounter === maxLoopCount) {
        return makeErr(
            ctx,
            `you may have an infinite loop in your program - they are very easy to run into, which is why I have a limiter of 1,000,000 iterations per loop for now`
        );
    }

    return makeNull();
}

function evaluateString(x) {
    return makeString(x.text);
}

function evaluateList(ctx, x) {
    const exprs = evaluateExprArray(ctx, x.items);
    if (exprs.vt === VT_ERROR) {
        return exprs;
    }

    return {
        vt: VT_LIST,
        items: exprs
    };
}

function evaluateExpression(ctx, x) {
    if (!x) {
        throw new Error("expression not defined");
    }

    const type = x.t;
    let value;
    ctx.currentNode = x;

    switch (type) {
        case T_NUMBER:
            value = evaluateNumber(x);
            break;
        case T_STRING:
            value = evaluateString(x);
            break;
        case T_BLOCK:
            ctx.variables.pushStackFrame();
            value = evaluateBlock(ctx, x);
            ctx.variables.popStackFrame();
            break;
        case T_BUILTIN_CONSTANT:
        case T_IDENT:
            value = evaluateVariable(ctx, x);
            break;
        case T_EXPR_INDEXATION:
            value = evaluateIndexation(ctx, x);
            break;
        case T_EXPR:
        case T_TERM:
        case T_COMPARISON:
            value = evaluateChain(ctx, x);
            break;
        case T_UNARY_EXPR:
            value = evaluateUnaryExpr(ctx, x);
            break;
        case T_FUNCTION_CALL:
            value = evaluateFunctionCall(ctx, x);
            break;
        case T_ASSIGNMENT:
            value = evaluateAssignment(ctx, x);
            break;
        case T_TERNARY:
            value = evaluateTernary(ctx, x);
            break;
        case T_TENSOR:
            value = evaluateTensor(ctx, x);
            break;
        case T_FOR_LOOP:
            value = evaluateForLoop(ctx, x);
            break;
        case T_LIST:
            value = evaluateList(ctx, x);
            break;
        default:
            value = makeErr(ctx, "Unknown ast node type: " + type);
            break;
    }

    if (typeof value === "object" && value !== null) {
        value.astNode = x;
    }

    return value;
}

// a stack of hashmaps to keep track of scopes.
// the hashmaps are pooled, because that is probably more efficient than
// appending and popping a new map from an array a thousand times
class ScopeStack {
    constructor() {
        this.scopes = [new Map()];
        this.currentScope = 0;
    }
    pushStackFrame() {
        if (this.currentScope === this.scopes.length - 1) {
            this.scopes.push(new Map());
        }

        this.currentScope++;
        this.scopes[this.currentScope].clear();
    }
    popStackFrame() {
        this.currentScope--;
    }
    has(key) {
        for (let i = this.currentScope; i >= 0; i--) {
            if (this.scopes[i].has(key)) {
                return true;
            }
        }

        return false;
    }
    getRef(ctx, key) {
        for (let i = this.currentScope; i >= 0; i--) {
            if (this.scopes[i].has(key)) {
                return this.scopes[i].get(key);
            }
        }

        return null;
    }
    get(ctx, key) {
        const ref = this.getRef(ctx, key);
        if (ref === null) return ref;

        return ref.currentValue;
    }
    set(ctx, key, value, assignType, setRef = false) {
        // if declaration, create variable in local scope
        if (assignType === ASSIGN_DECLARE) {
            const currentScope = this.scopes[this.currentScope];
            if (currentScope.has(key))
                return makeErr(
                    ctx,
                    `variable ${key} already defined, with value: ${valueToString(
                        currentScope.get(key).currentValue
                    )}`
                );

            if (setRef) {
                currentScope.set(key, value);
            } else {
                currentScope.set(key, { currentValue: value });
            }
            return null;
        }

        // We are assigning to an existing variable.

        const existingRef = this.getRef(ctx, key);
        if (assignType === ASSIGN_INCREMENT) {
            value = applyOperator(ctx, existingRef.currentValue, value, { text: "+" });
        } else if (assignType === ASSIGN_DECREMENT) {
            value = applyOperator(ctx, existingRef.currentValue, value, { text: "-" });
        }

        // set variable in whatever scope it is in
        for (let i = this.currentScope; i >= 0; i--) {
            if (!this.scopes[i].has(key)) continue;

            if (setRef) {
                this.scopes[i].set(key, value);
            } else {
                existingRef.currentValue = value;
            }

            return null;
        }

        return makeErr(ctx, `couldn't set ${key}, it wasn't found anywhere`);
    }
}

function createProgramContext(text) {
    return {
        currentAstNode: null,
        variables: new ScopeStack(),
        errors: [],
        results: [],
        programResult: makeNull(),
        text: text
    };
}

function evaluateProgram(program, text) {
    const ctx = createProgramContext(text);

    if (program.parseError) {
        ctx.programResult = makeErr(ctx, program.parseError);
        return ctx;
    }

    for (let i = 0; i < program.expressions.length; i++) {
        ctx.programResult = evaluateExpression(ctx, program.expressions[i]);
        if (ctx.programResult === VT_ERROR) {
            break;
        }
    }
    try {
    } catch (err) {
        ctx.programResult = makeErr(ctx, `A Javascript error occurred while evaluating your program: ${err}`);
    }

    return ctx;
}

// not a particularly good visualisation. TODO: improve
function tensorToString(t) {
    if (t.vt !== VT_TENSOR) {
        return valueToString(t);
    }

    let counter = 0;
    const dfs = (level) => {
        if (level === t.shape.length) {
            let val = t.data[counter];
            counter++;
            return val;
        }

        let stringBuilder = [];
        for (let i = 0; i < t.shape[level]; i++) {
            let str = dfs(level + 1);
            if (i > 0) {
                str = " " + str;
            }
            stringBuilder.push(str);
        }

        const joinStr = level === t.shape.length - 1 ? ", " : ", \n";
        return "[" + stringBuilder.join(joinStr) + "]";
    };

    let dataStr = dfs(0);

    return "shape: " + t.shape.join("x") + ", data: \n" + dataStr.replace(/\n/g, "\n\t");
}

function valueToString(v) {
    if (!v) {
        return "{}";
    }

    switch (v.vt) {
        case VT_NULL:
            return "{}";
        case VT_TENSOR:
            return tensorToString(v).replace("\n", "\n\t");
        case VT_NUMBER:
            return v.val.toString();
        case VT_STRING:
            return v.val; //"\"" + v.val.toString().replace(/"/g, "\\\"") + "\"";
        case VT_FUNCTION:
            return (
                v.text +
                (v.captures.length === 0
                    ? ""
                    : " where " +
                      v.captures.map((x) => x[0] + "=" + valueToString(x[1].currentValue)).join(", "))
            );
        case VT_LIST:
            return "<" + v.items.map((i) => valueToString(i)).join(",\n") + ">";
        default:
            return `${v.val}`;
    }
}

function thingToString(v) {
    let type = vtToString(v.vt);
    let str = valueToString(v);

    return `[${type}] ${str}`;
}
