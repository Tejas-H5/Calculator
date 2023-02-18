// ---- parser
// This file has code that parses some math expressions into an AST.
// Some programming constructs like ternaries, for loops, functions and variables are also supported.

const debug = true;
const T_NUMBER = debug ? "T_NUMBER" : 1;
const T_OP_EXPR = debug ? "T_OP_EXPR" : 2;
const T_OP_TERM = debug ? "T_OP_TERM" : 3;
const T_TERM = debug ? "T_TERM" : 4;
const T_BUILTIN_CONSTANT = debug ? "T_BUILTIN_CONSTANT" : 5;
const T_UNARY_OP = debug ? "T_UNARY_OP" : 6;
const T_IDENT = debug ? "T_IDENT" : 7; // arbitrary text, could be anything.
const T_FUNCTION_CALL = debug ? "T_FUNCTION_CALL" : 8;
const T_OP_EXPONENT = debug ? "T_OP_EXPONENT" : 9;
const T_ASSIGNMENT = debug ? "T_ASSIGNMENT" : 10;
const T_TERNARY = debug ? "T_TERNARY" : 11;
const T_TENSOR = debug ? "T_TENSOR" : 12;
const T_EXPR_INDEXATION = debug ? "T_EXPR_INDEXATION" : 13;
const T_FOR_LOOP = debug ? "T_FOR_LOOP" : 14;
const T_BLOCK = debug ? "T_BLOCK" : 15;
const T_STRING = debug ? "T_STRING" : 16;
const T_OP_COMPARISON = debug ? "T_OP_COMPARISON" : 17;
const T_COMPARISON = debug ? "T_COMPARISON" : 18;
const T_LIST = debug ? "T_LIST" : 19;
const T_UNARY_EXPR = debug ? "T_UNARY_EXPR" : 20;
const T_EXPR = debug ? "T_EXPR" : 21;

const reservedKeywords = ["for"];

// Thankyou Trevor https://stackoverflow.com/questions/1496826/check-if-a-single-character-is-a-whitespace
function isWhitespace(c) {
    return (
        c === " " ||
        c === "\n" ||
        c === "\t" ||
        c === "\r" ||
        c === "\f" ||
        c === "\v" ||
        c === "\u00a0" ||
        c === "\u1680" ||
        c === "\u2000" ||
        c === "\u200a" ||
        c === "\u2028" ||
        c === "\u2029" ||
        c === "\u202f" ||
        c === "\u205f" ||
        c === "\u3000" ||
        c === "\ufeff"
    );
}

function isDigit(c) {
    return (
        c === "1" ||
        c === "2" ||
        c === "3" ||
        c === "4" ||
        c === "5" ||
        c === "6" ||
        c === "7" ||
        c === "8" ||
        c === "9" ||
        c === "0"
    );
}

function isLetter(c) {
    return c.toUpperCase() != c.toLowerCase() || c.codePointAt(0) > 127 || c === "_";
}

// this code also parses comments.
// This way, comments can appear almost anywhere in the
function advanceWhileWhitespace(text, pos) {
    if (debug) {
        if (typeof text !== "string") {
            throw new Error("you might be calling advanceWhileWhitespace wrong");
        }
    }

    while (pos < text.length && (isWhitespace(text[pos]) || (text[pos] === "/" && text[pos + 1] === "/"))) {
        // single line comment, ignore all text on the same line after //.
        // TODO: figure out how we can actually store these comments and use them
        // in a meaningful way
        if (text[pos] === "/") {
            console.log("comment")
            pos += 2;
            while (pos < text.length && text[pos] !== "\n") {
                pos++;
            }
        }

        pos++;
    }
    return pos;
}

function hasText(text, pos, comp) {
    if (pos + comp.length > text.length) {
        return false;
    }

    return text.substring(pos, pos + comp.length) === comp;
}

// parses one of some array possible delimiters. oneOfWhat is an array of possible strings.
// It is important that the delimiters are arranged in order of longest to shortest.
// If you pass in ["<", "<="] and we have "<=" in the string, we won't get to it because we also have "<".
function parseOneOf(text, ctx, lines, possibleDelimiters, type) {
    const pos = advanceWhileWhitespace(text, ctx.pos);
    ctx.pos = pos;

    for (let i in possibleDelimiters) {
        const end = pos + possibleDelimiters[i].length;
        if (!hasText(text, pos, possibleDelimiters[i])) {
            continue;
        }

        ctx.pos = end;
        lines.push({
            t: type,
            start: pos,
            end: end,
            text: text.substring(pos, end)
        });
        return true;
    }

    return false;
}

function parseOpComparison(text, ctx, ops) {
    return parseOneOf(text, ctx, ops, [">=", "<=", "==", ">", "<"], T_OP_COMPARISON);
}

// operators with the same precedence as addition
function parseOpExpr(text, ctx, ops) {
    return parseOneOf(text, ctx, ops, ["+", "-"], T_OP_EXPR);
}

// one of *, /, %
function parseOpTerm(text, ctx, ops) {
    return parseOneOf(text, ctx, ops, ["**", "*", "/", "%", "^"], T_OP_TERM);
}

// one of ^
function parseOpExponent(text, ctx, ops) {
    return parseOneOf(text, ctx, ops, ["^"], T_OP_EXPONENT);
}

// operators with the same precedence as multiplication
function parseNumber(text, ctx, lines) {
    const start = advanceWhileWhitespace(text, ctx.pos);
    if (start >= text.length) {
        return false;
    }
    ctx.pos = start;

    if (!isDigit(text[ctx.pos])) return false;

    let foundDecimal = false;
    while (ctx.pos < text.length && (isDigit(text[ctx.pos]) || (!foundDecimal && text[ctx.pos] === "."))) {
        if (text[ctx.pos] === ".") {
            foundDecimal = true;
        }

        ctx.pos++;
    }

    lines.push({
        t: T_NUMBER,
        start: start,
        end: ctx.pos,
        text: text.substring(start, ctx.pos)
    });
    return true;
}

// Parses a series of terms like <term> (<operator> <term>)*
// the parsers for term and operator can be specified as functions
function parseChain(text, ctx, lines, type, termParser, opParser) {
    let start = advanceWhileWhitespace(text, ctx.pos);
    if (start >= text.length) {
        return false;
    }

    const termsAndOps = [];

    if (!termParser(text, ctx, termsAndOps)) {
        return false;
    }

    while (opParser(text, ctx, termsAndOps)) {
        if (!termParser(text, ctx, termsAndOps)) {
            // remove the last operator we parsed, we shouldn't have
            const op = termsAndOps.pop();

            // reset end
            ctx.pos = termsAndOps[termsAndOps.length - 1].end;
            break;
        }
    }

    if (termsAndOps.length === 1) {
        // unwraps a single term to be it's own thing.
        // the AST becomes unmanageably large if we don't unwrap nodes like this.
        // although performance might be better, it is mainly a debugging optimization
        lines.push(termsAndOps[0]);
    } else {
        lines.push({
            t: type,
            start: start,
            end: ctx.pos,
            text: text.substring(start, ctx.pos),
            termsAndOps: termsAndOps,
            show: false,
            lineNumber: 0
        });
    }

    return true;
}

function parseGroup(text, ctx, lines) {
    const start = advanceWhileWhitespace(text, ctx.pos);
    if (start >= text.length) {
        return false;
    }

    if (text[start] === "(") {
        ctx.pos = start + 1;
        if (parseExpressionTopLevel(text, ctx, lines)) {
            ctx.pos = advanceWhileWhitespace(text, ctx.pos);
            if (text[ctx.pos] === ")") {
                lines[lines.length - 1].start = start;
                lines[lines.length - 1].end++;
                ctx.pos++;
                return true;
            }
        }
    }
    return false;
}

// also parses a tensor indexing op like x[1][1][1]
function parseVariable(text, ctx, lines) {
    const start = ctx.pos;

    if (!parseIdentifier(text, ctx, lines)) return false;
    return true;
}

function parseUnaryExpr(text, ctx, lines) {
    const start = advanceWhileWhitespace(text, ctx.pos);
    if (start >= text.length) {
        return false;
    }

    const op = [];
    const expr = [];

    ctx.pos = start;
    if (!parseOneOf(text, ctx, op, unaryOps, T_UNARY_OP)) {
        return false;
    }

    ctx.pos = advanceWhileWhitespace(text, ctx.pos);
    if (!parseThing(text, ctx, expr)) {
        return false;
    }

    lines.push({
        t: T_UNARY_EXPR,
        start: start,
        end: ctx.pos,
        op: op[0],
        expr: expr[0]
    });
    return true;
}

function parseIdentifier(text, ctx, lines) {
    const start = advanceWhileWhitespace(text, ctx.pos);
    if (start >= text.length) {
        return false;
    }

    let pos = start;
    if (!isLetter(text[pos])) {
        return false;
    }
    pos++;

    while (pos < text.length && (isDigit(text[pos]) || isLetter(text[pos]))) {
        pos++;
    }

    ctx.pos = pos;

    const identText = text.substring(start, ctx.pos);
    if (reservedKeywords.includes(identText)) return false;

    lines.push({
        t: T_IDENT,
        start: start,
        end: ctx.pos,
        text: identText
    });

    return true;
}

// this function does not know the size of the terminator, so it will stop on the terminator.
// this is unlike all other parsing functions, that stop one after the final character
function parseDelimitedList(text, ctx, lines, exprParser, hasDelimiter, hasTerminator, mustTerminate = true) {
    const start = advanceWhileWhitespace(text, ctx.pos);
    if (start >= text.length) {
        return false;
    }

    if (hasTerminator(text, ctx.pos)) {
        return true;
    }

    ctx.pos = start;
    let terminated = false;
    while (exprParser(text, ctx, lines)) {
        ctx.pos = advanceWhileWhitespace(text, ctx.pos);
        if (hasDelimiter(text, ctx.pos)) {
            //text[nextStartPos] === delimiter
            ctx.pos += 1;
            continue;
        }

        if (hasTerminator(text, ctx.pos)) {
            // text[nextStartPos] === terminator
            terminated = true;
            break;
        }

        return false;
    }

    if (mustTerminate && !terminated) {
        // allow for things like [1,2,] (trailing comma)
        ctx.pos = advanceWhileWhitespace(text, ctx.pos);
        if (!hasTerminator(text, ctx.pos)) {
            return false;
        }
    }

    return true;
}

function parseFunctionCall(text, ctx, lines) {
    const start = advanceWhileWhitespace(text, ctx.pos);
    if (start >= text.length) {
        return false;
    }

    const name = [];
    const args = [];

    ctx.pos = start;
    if (!parseIdentifier(text, ctx, name)) {
        return false;
    }

    if (text[ctx.pos] != "(") {
        return false;
    }
    ctx.pos++;

    const argsStartPos = advanceWhileWhitespace(text, ctx.pos);

    ctx.pos = argsStartPos;
    if (
        !parseDelimitedList(
            text,
            ctx,
            args,
            parseAssignment,
            (t, pos) => hasText(t, pos, ","),
            (t, pos) => hasText(t, pos, ")")
        )
    ) {
        return false;
    }

    ctx.pos += 1;

    lines.push({
        t: T_FUNCTION_CALL,
        start: start,
        end: ctx.pos,
        name: name[0],
        args: args
    });

    return true;
}

// it assumes the starting pos already has a digit. don't call it otherwise
function parseIntInline(text, ctx) {
    const start = ctx.pos;
    while (ctx.pos < text.length && isDigit(text[ctx.pos])) {
        ctx.pos++;
    }

    return parseInt(text.substring(start, ctx.pos));
}

// surprisingly complicated
function parseTensor(text, ctx, lines) {
    const start = advanceWhileWhitespace(text, ctx.pos);
    if (start >= text.length) {
        return false;
    }

    const shape = [];

    if (text[start] !== "[") {
        return false;
    }

    ctx.pos += 1;
    const rows = [];
    // probably more optimal to only be parsing tensors or numbers here.
    if (
        !parseDelimitedList(
            text,
            ctx,
            rows,
            parseExpressionTopLevel,
            (t, pos) => hasText(t, pos, ","),
            (t, pos) => hasText(t, pos, "]")
        )
    ) {
        return false;
    }
    ctx.pos += 1;

    // we need to figure out the shape, and evaluate the inline expressions later in the evaluation step
    lines.push({
        t: T_TENSOR,
        start: start,
        end: ctx.pos,
        rows: rows,
        evaluated: false
    });
    return true;
}

// parses a time like 4:20 into a number representing the number of minutes since the start of the day.
// useful for common duration calculations that I would use a calculator for
function parseHmTime(text, ctx, lines) {
    const start = advanceWhileWhitespace(text, ctx.pos);
    if (start >= text.length) {
        return false;
    }
    ctx.pos = start;

    let h = 0,
        m = 0;

    if (!isDigit(text[ctx.pos])) return false;

    h = parseIntInline(text, ctx);

    ctx.pos = advanceWhileWhitespace(text, ctx.pos);

    if (text[ctx.pos] !== ":") return false;
    ctx.pos++;

    if (!isDigit(text[ctx.pos])) return false;

    const mTemp = [];
    if (!parseNumber(text, ctx, mTemp)) return false;
    m = evaluateNumber(mTemp[0]).val;

    ctx.pos = advanceWhileWhitespace(text, ctx.pos);
    if (hasText(text, ctx.pos, "am") || hasText(text, ctx.pos, "AM")) {
        ctx.pos += 2;
    } else if (hasText(text, ctx.pos, "pm") || hasText(text, ctx.pos, "PM")) {
        if (h < 12) {
            h += 12;
        }
        ctx.pos += 2;
    }

    lines.push({
        t: T_NUMBER,
        start: start,
        end: ctx.pos,
        text: (h * 60 + m).toString()
    });
    return true;
}

function parseList(text, ctx, lines) {
    const start = advanceWhileWhitespace(text, ctx.pos);
    if (start >= text.length) {
        return false;
    }

    const items = [];

    if (text[ctx.pos] !== "<") return false;
    ctx.pos += 1;

    if (
        !parseDelimitedList(
            text,
            ctx,
            items,
            parseExpressionTopLevel,
            (t, pos) => hasText(t, pos, ","),
            (t, pos) => hasText(t, pos, ">")
        )
    ) {
        return false;
    }
    ctx.pos += 1;

    lines.push({
        t: T_LIST,
        start: start,
        end: ctx.pos,
        items: items
    });
    return true;
}

function parseString(text, ctx, lines) {
    const start = advanceWhileWhitespace(text, ctx.pos);
    if (start >= text.length) {
        return false;
    }

    if (text[ctx.pos] !== '"') return false;
    ctx.pos++;

    while (
        ctx.pos < text.length &&
        (text[ctx.pos] !== '"' || (text[ctx.pos] === '"' && text[ctx.pos - 1] === "\\"))
    ) {
        ctx.pos++;
    }

    if (text[ctx.pos] !== '"') return false;
    ctx.pos++;

    lines.push({
        t: T_STRING,
        start: start,
        end: ctx.pos,
        text: text.substring(start + 1, ctx.pos - 1).replace(/\\"/g, '"')
    });
    return true;
}

// note that the ordering matters
function parseThing(text, ctx, lines) {
    const start = advanceWhileWhitespace(text, ctx.pos);
    if (start >= text.length) {
        return false;
    }

    ctx.pos = start;
    if (parseBlock(text, ctx, lines)) return true;

    ctx.pos = start;
    if (parseGroup(text, ctx, lines)) return true;

    ctx.pos = start;
    if (parseUnaryExpr(text, ctx, lines)) return true;

    ctx.pos = start;
    if (parseFunctionCall(text, ctx, lines)) return true;

    // important that this is after parseFunctionCall and what have you, the function name will be confused for a variable otherwise
    ctx.pos = start;
    if (parseVariable(text, ctx, lines)) return true;

    // primitives

    ctx.pos = start;
    if (parseHmTime(text, ctx, lines)) return true;

    ctx.pos = start;
    if (parseNumber(text, ctx, lines)) return true;

    ctx.pos = start;
    if (parseTensor(text, ctx, lines)) return true;

    ctx.pos = start;
    if (parseString(text, ctx, lines)) return true;

    ctx.pos = start;
    if (parseList(text, ctx, lines)) return true;

    return false;
}

function parseExponent(text, ctx, lines) {
    return parseChain(text, ctx, lines, T_TERM, parseThing, parseOpExponent);
}

function parseTerm(text, ctx, lines) {
    return parseChain(text, ctx, lines, T_TERM, parseExponent, parseOpTerm);
}

function parseExpression(text, ctx, lines) {
    return parseChain(text, ctx, lines, T_EXPR, parseTerm, parseOpExpr);
}

function parseComparison(text, ctx, lines) {
    return parseChain(text, ctx, lines, T_COMPARISON, parseExpression, parseOpComparison);
}

// parses [num][num][num]...
function parseIndexation(text, ctx, indexes) {
    if (text[ctx.pos] !== "[") {
        return false;
    }

    while (hasText(text, ctx.pos, "[")) {
        ctx.pos = advanceWhileWhitespace(text, ctx.pos + 1);

        if (!parseExpressionTopLevel(text, ctx, indexes)) return false;

        ctx.pos = advanceWhileWhitespace(text, ctx.pos);
        if (text[ctx.pos] !== "]") {
            return false;
        }
        ctx.pos = advanceWhileWhitespace(text, ctx.pos + 1);
    }

    return true;
}

// consider having a new T_BLOCK or something
function parseBlock(text, ctx, lines) {
    const start = advanceWhileWhitespace(text, ctx.pos);
    if (ctx.pos >= text.length) {
        return false;
    }
    ctx.pos = start;

    const body = [];

    if (!hasText(text, ctx.pos, "{")) return false;
    ctx.pos = advanceWhileWhitespace(text, ctx.pos + 1);

    if (!hasText(text, ctx.pos, "}")) {
        if (!parseExpressionList(text, ctx, body)) return false;
        ctx.pos = advanceWhileWhitespace(text, ctx.pos);
    }

    if (!hasText(text, ctx.pos, "}")) {
        return false;
    }

    ctx.pos += 1;
    lines.push({
        t: T_BLOCK,
        start: start,
        end: ctx.pos,
        body: body
    });
    return true;
}

function parseForLoop(text, ctx, lines) {
    const start = advanceWhileWhitespace(text, ctx.pos);
    if (start >= text.length) {
        return false;
    }

    if (!hasText(text, ctx.pos, "for")) return false;

    ctx.pos = advanceWhileWhitespace(text, ctx.pos + 3);

    const initializers = [];
    const loopCondition = [];
    const iterators = [];
    const loopBody = [];

    // parse initializers
    if (
        !parseDelimitedList(
            text,
            ctx,
            initializers,
            parseAssignment,
            (t, pos) => hasText(t, pos, ","),
            (t, pos) => hasText(t, pos, ";"),
            false
        )
    ) {
        return false;
    }
    ctx.pos = advanceWhileWhitespace(text, ctx.pos + 1);

    // parse loop condition expression
    if (!parseExpressionTopLevel(text, ctx, loopCondition)) return false;
    ctx.pos = advanceWhileWhitespace(text, ctx.pos);

    if (!hasText(text, ctx.pos, ";")) return false;
    ctx.pos = advanceWhileWhitespace(text, ctx.pos + 1);

    // parse loop iterators (this will stop exactly on the brace and not go past it)
    if (
        !parseDelimitedList(
            text,
            ctx,
            iterators,
            parseAssignment,
            (t, pos) => hasText(t, pos, ","),
            (t, pos) => hasText(t, pos, "{")
        )
    ) {
        return false;
    }

    // parse loop body
    if (!parseBlock(text, ctx, loopBody)) {
        return false;
    }

    lines.push({
        t: T_FOR_LOOP,
        start: start,
        end: ctx.pos,
        initializers: initializers,
        loopCondition: loopCondition[0],
        iterators: iterators,
        loopBody: loopBody[0]
    });
    return true;
}

function parseExpressionTopLevel(text, ctx, lines) {
    const start = advanceWhileWhitespace(text, ctx.pos);
    if (start >= text.length) {
        return false;
    }

    // TODO: try moving to root level as thing
    ctx.pos = start;
    if (parseForLoop(text, ctx, lines)) return true;

    // parse an expression. the ternary is the top-level of an expression.
    ctx.pos = start;
    if (!parseTernary(text, ctx, lines)) return false;

    const indexes = [];
    ctx.pos = advanceWhileWhitespace(text, ctx.pos);
    if (parseIndexation(text, ctx, indexes)) {
        lines[lines.length - 1] = {
            t: T_EXPR_INDEXATION,
            start: start,
            end: ctx.pos,
            expr: lines[lines.length - 1],
            indexes: indexes
        };
        return true;
    }

    return true;
}

function parseTernary(text, ctx, lines) {
    const expr = [];
    if (!parseComparison(text, ctx, expr)) return false;

    ctx.pos = advanceWhileWhitespace(text, ctx.pos);
    if (text[ctx.pos] !== "?") {
        // we only got an expression, that is fine
        lines.push(expr[0]);
        return true;
    }

    ctx.pos = advanceWhileWhitespace(text, ctx.pos + 1);

    if (!parseComparison(text, ctx, expr)) return false;

    ctx.pos = advanceWhileWhitespace(text, ctx.pos);
    if (text[ctx.pos] !== ":") {
        // we only got one branch of the ternary, that isn't enough
        return false;
    }

    // the next part can also be a ternary, i.e
    // x := y < 0 ? 2 : y > 3 ? 3 : 0

    ctx.pos = advanceWhileWhitespace(text, ctx.pos + 1);
    if (!parseTernary(text, ctx, expr)) {
        // we weren't able to parse the second branch of the ternary
        return false;
    }

    lines.push({
        t: T_TERNARY,
        start: expr[0].start,
        end: ctx.pos,
        conditional: expr[0],
        ifTrue: expr[1],
        else: expr[2]
    });
    return true;
}

// my compiler architecture prevents me from implementing += and -= properly at the moment, so
// I will hardcode them since they are so useful
const ASSIGN_SET = "set";
const ASSIGN_DECLARE = "declare";
const ASSIGN_INCREMENT = "increment";
const ASSIGN_DECREMENT = "decrement";

function parseAssignment(text, ctx, lines) {
    const start = advanceWhileWhitespace(text, ctx.pos);
    if (start >= text.length) {
        return false;
    }

    const lhs = [];
    const rhs = [];
    if (!parseExpressionTopLevel(text, ctx, lhs)) return false;

    const assignOpPos = advanceWhileWhitespace(text, ctx.pos);

    let type = ASSIGN_SET;
    if (hasText(text, assignOpPos, "=")) {
        ctx.pos = assignOpPos + 1;
    } else if (hasText(text, assignOpPos, ":=")) {
        ctx.pos = assignOpPos + 2;
        type = ASSIGN_DECLARE;
    } else if (hasText(text, assignOpPos, "-=")) {
        ctx.pos = assignOpPos + 2;
        type = ASSIGN_DECREMENT;
    } else if (hasText(text, assignOpPos, "+=")) {
        ctx.pos = assignOpPos + 2;
        type = ASSIGN_INCREMENT;
    } else {
        // it isn't an assignment. we are just unwrapping
        lines.push(lhs[0]);
        return true;
    }

    if (!parseExpressionTopLevel(text, ctx, rhs)) {
        return false;
    }

    lines.push({
        t: T_ASSIGNMENT,
        start: start,
        end: ctx.pos,
        lhs: lhs[0],
        rhs: rhs[0],
        assignType: type
    });
    return true;
}

function parseExpressionList(text, ctx, list) {
    const start = advanceWhileWhitespace(text, ctx.pos);
    if (start >= text.length) {
        return false;
    }

    while (parseAssignment(text, ctx, list)) {
        const endsWithSemicolon = text[ctx.pos] === ";";

        const lastAdded = list[list.length - 1];
        lastAdded.show = !endsWithSemicolon;
        lastAdded.lineNumber = text.substring(0, lastAdded.start).split("\n").length - 1;

        if (endsWithSemicolon) {
            ctx.pos++;
        }
    }

    return start !== ctx.pos;
}

// return an AST-like thing
function parseProgram(text) {
    const ctx = { pos: 0 };
    const lines = [];

    // this used to be a while loop, we may need to fix a bug here. if not, delete this comment
    parseExpressionList(text, ctx, lines);
    ctx.pos = advanceWhileWhitespace(text, ctx.pos);

    const root = {
        expressions: lines,

        // most error checking/validating is done in the evaluate step, so this has very limited use
        parseError: null
    };

    if (ctx.pos !== text.length) {
        const lines = text.substring(0, ctx.pos).split("\n");
        const linePos = ctx.pos - lines.lastIndexOf("\n");
        let contextText = text.substring(ctx.pos);
        if (contextText.length > 50) {
            contextText = contextText.substring(0, 50) + "...";
        }
        root.parseError = `Couldn't read line ${lines.length} pos ${linePos}: "${contextText}"`;
    }

    return root;
}

function debugFormatAST(ast, text) {
    const dfs = (node) => {
        if (typeof node === "string") {
            return;
        }

        if (node === null || node === undefined) {
            return "undefined";
        }

        const limit = 10;
        if (
            typeof node.length === "number" &&
            node.length > limit &&
            node.push !== undefined &&
            node.splice !== undefined
        ) {
            let originalLength = node.length;
            node.splice(limit, node.length - limit);
            node.push(
                "and " +
                    (originalLength - limit) +
                    " more items that have been hidden for performance reasons"
            );
        }

        for (const k of Object.keys(node)) {
            dfs(node[k]);
        }
    };

    dfs(ast);
    return ast;
}


// The sub-nodes that exist for each AST node type
function getKeysForAstNodeType_Ordered(t) {
    switch (t) {
        case T_BLOCK:
            return ["body"];
        case T_EXPR_INDEXATION:
            return ["expr", "indexes"];
        case T_EXPR:
        case T_TERM:
        case T_COMPARISON:
            return ["termsAndOps"];
        case T_UNARY_EXPR:
            return ["op", "expr"];
        case T_FUNCTION_CALL:
            return ["name", "args"];
        case T_ASSIGNMENT:
            return ["lhs", "rhs"];
        case T_TERNARY:
            return ["conditional", "ifTrue", "else"];
        case T_TENSOR:
            return ["rows"];
        case T_FOR_LOOP:
            return ["initializers", "loopCondition", "iterators", "loopBody"];
        case T_LIST:
            return ["items"];
    }

    return null;
}