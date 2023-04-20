function TestingHarness(mountPoint) {
    const { 
        testTable, showPassingInput, showFailingInput, showUnknown,
        passingCount, failingCount, manualCount
    } = createComponent(
        mountPoint,
        `<div style="padding: 10px">
            <div style="margin-top: 20px">
                <h3 title="these are really test cases">Examples</h3>
                <div>
                <input type="checkbox" --id="showPassingInput"></input>
                <span --id="passingCount">Passing</span>,
                <input type="checkbox" --id="showFailingInput" checked></input>
                <span --id="failingCount">Failing</span>,
                <input type="checkbox" --id="showUnknown" checked></input>
                <span --id="manualCount">Requiring manual inspection</span>
                </div>
                <table --id="testTable" style="width: 100%"></table>
            </div>
        </div>`
    );

    const state = {
        onTestcaseSelect: (testcase) => {},
        onWantRetest: () => {},
        renderTests: (testCases, onlyShowInteresting) => {
            const { passes, fails, manual } = renderTests(state, testTable, testCases, (testcase) => {
                return  (!testcase.isVisualTest && testcase.isPassing && showPassingInput.checked) ||
                        (!testcase.isVisualTest && !testcase.isPassing && showFailingInput.checked) ||
                        (testcase.isVisualTest && showUnknown.checked);
            });

            passingCount.textContent = "Passing: " + passes;
            failingCount.textContent = "Passing: " + fails;
            manualCount.textContent = "Needs manual verification: " + manual;
        }
    };

    showPassingInput.addEventListener("change", () => state.onWantRetest());
    showFailingInput.addEventListener("change", () => state.onWantRetest());
    showUnknown.addEventListener("change", () => state.onWantRetest());

    return state;
}

// TODO: componentize this (the old codebase was vanillaJS, so it was doing string building everywhere)
function renderTests(state, mountPoint, testcases, shouldShowTest) {
    let passes = 0,
        fails = 0,
        manual = 0;

    testcases.forEach((testcase) => {
        testcase.isPassing = true;
        testcase.strOutput = ""

        let expected = "";

        try {
            const text = testcase.input;
            const ast = parseProgram(text);
            const results = evaluateProgram(ast, text);
            testcase.strOutput = valueToString(results.programResult);

            if (typeof testcase.expected === "string") {
                expected = testcase.expected;
                testcase.isPassing = testcase.expected.replace(/\s/g, "") === testcase.strOutput.replace(/\s/g, "");
            } else {
                testcase.expected(results);
            }
        } catch (e) {
            testcase.strOutput = "Exception";
            console.error(e);
            expected = e.message || "";
            testcase.isPassing = false;
        }

        if (!testcase.isVisualTest) {
            if (testcase.isPassing) {
                passes++;
            } else {
                fails++;
            }
        } else {
            manual++;
        }
    });

    const tests = testcases.filter(shouldShowTest);

    let testcaseTableHTML =
        `
        <tr><th>Input</th><th>Output</th></tr>
    ` +
        tests
            .map((testcase, i) => {
                return `
                <tr>
                    <td class="testcase-button" data-testcase-id="${i}">
                        <h4>${sanitizeHTML(testcase.name)}</h4>
                        <p class="example-code" title="click to preview this example">
                            ${sanitizeHTML(testcase.input)}
                        </p>
                    </td>
                    <td class="${testcase.isVisualTest ? "" : testcase.isPassing ? "passing" : "failing"}" title="${
                    testcase.isVisualTest
                        ? "this test must be manually inspected"
                        : testcase.isPassing
                        ? "this testcase is passing"
                        : "this testcase is failing"
                }">
                        ${
                            testcase.isPassing
                                ? truncate(sanitizeHTML(testcase.strOutput), 70)
                                : `
                                <h4>Got:</h4>
                                <p>
                                    ${sanitizeHTML(testcase.strOutput)}
                                </p>
                                <h4>Expected:</h4>
                                <p>
                                    ${sanitizeHTML(expected)}
                                </p>
                            `
                        }
                    </td>
                </tr>`;
            })
            .join("\n");

    mountPoint.innerHTML = testcaseTableHTML;
    for (let id = 0; id < tests.length; id++) {
        const button = mountPoint.querySelector(`.testcase-button[data-testcase-id="${id}"]`);
        button.addEventListener("click", (e) => {
            state.onTestcaseSelect(tests[parseInt(button.getAttribute("data-testcase-id"))]);
        });
    }

    return { passes, fails, manual };
}

function truncate(t, len) {
    if (t.length > len) {
        return t.substring(0, len) + "...";
    }

    return t;
}

// ---- add testcases,

// TODO: convert tests into the new function way rather than a string comparison
const testcases = [
    {
        name: "Slider test",
        input: `
// trying to draw a clock looking thing 
granularity := slider("granularity", 5, 5, 36, 1)
theta := slider("angle", 0, 0, 2*PI, 2*PI/granularity);

handleLength := 10;

// draw clock outline
points := <>
for i := 0; i <= granularity; i+=1 {
    angle := (i / granularity) * 2*PI;
    points += [
        handleLength * sin(angle), 
        handleLength * cos(angle)
    ]
}

// draw clock handle
plot(points, [
    [handleLength * sin(theta), handleLength * cos(theta)],
    [sin(theta + PI/2), cos(theta + PI/2)],
    [sin(theta + PI), cos(theta + PI)],
    [sin(theta + 3*PI/2), cos(theta + 3*PI/2) ],
    [handleLength * sin(theta), handleLength * cos(theta)],
])
`,
        expected: `{}`,
        isVisualTest: true
    },
    {
        name: "Test matrix mult 2",
        input: `
// Draw some line segments:
line := ~[
    [1, 1],
    [1, 1],
	[1, 1],
	[1, 1],
]

// zero the x coordinates
A := [[1, 0],
	  [0, 0]]

print(A)
print(~A)
print(line)
~(A ** line)
`,
        expected: (res) => {
            const mat = res.programResult;
            assert(mat.vt === VT_TENSOR, "Expected a tensor");
            assert(mat.shape[0] === 4 && mat.shape[1] === 2, "Wanted a 4x2");

            for (let i = 0; i < mat.data.length; i += 2) {
                assert(mat.data[i] === 1, "wanted x coords to be 1");
                assert(mat.data[i + 1] === 0, "wanted y coords to be 0");
            }
        }
    },
    {
        name: "Captures test",
        input: `
i := 0
f(x) := {
    i += x
    i
}

f(4)
`,
        expected: (res) => {
            assert(res.programResult.vt === VT_NUMBER, "Wanted a number");
            assert(res.programResult.val === 4, "wanted 4");
        }
    },
    {
        name: "Error printing test",
        input: `
print(1 + 1)

for i := 0; i < 10; i+=1 {
    print(123123 + "a") // should error
}
`,
        expected: (res) => {
            assert(res.errors.length === 10, "wanted 10 errors from that number + string operation there");
        }
    },
    {
        name: "Plotting test",
        input: `
// Draw some line segments:
line := [
    [1, 1],
    [1, -1],
    [-1, -1],
    [-1, 1],
    [1, 1],
]

line2 := [
    [0.5, -0.5],
    [-0.5, -0.5],
    [0, 0.5],
    [0.5, -0.5],
]

plot(line, line2)
`,
        expected: "{}",
        isVisualTest: true
    },
    {
        name: "basic math",
        input: `
// was failing for the longest time and I didnt even notice lol
-1 + 1`,
        expected: "0"
    },
    {
        name: "scope capturing",
        input: `
funcs := <>;
for i := 0; i < 3; i+=1 {
    // need to reference a scope-local var for this 
    // to work
    j := i + 1
    f(x) := sin(j*x)
    funcs += f;
}

g(x) := {
    // sometimes this sum variable can be mis-interpreted as a capture, in which case this won't work.
    // or we forget to push and pop a stack frame each time we evaluate this function in the graphing method, and
    // it thinks that sum is already declared
    sum := 0;
    for i := 0; i < len(funcs); i+= 1 {
        f := funcs[i];
        sum += f(x);
    }

    sum
}

// this should work. sometimes it doesn't
graph(g, 0, 1)

// this should graph multiple functions
graph(funcs, 0, 1)
`,
        expected: "{}",
        isVisualTest: true
    },
    {
        name: "XSS attack",
        input: `"<p onclick='alert(\\"efaf\\")'>dasdas</p>"`,
        expected: `<p onclick='alert("efaf")'>dasdas</p>`
    },
    {
        name: "typical math usecases",
        input: `
// most math expressions should be supported by this calculator
print(1 + 2 * 3 + 4^(sin(PI/2)*2), "first")

// do keep in mind that they are floating point numbers and not real numbers though
print(0.1+0.2, "0.1+0.2 (cries in floating point)")
`,
        expected: "{}",
        alwaysShow: true,
        isVisualTest: true
    },
    {
        name: "typical math expression",
        input: `1 + 2 * 3 + 4^(sin(PI/2)*2)`,
        expected: "23"
    },
    {
        name: "logical comparisons",
        input: `
// comparison operators will return 0 for false and 1 for true.
print(19 > 20, "comparison")

// Any number greater than 0.5 is considered true, and any number less than or equal to 0.5 is considered false
boolean(x) := x ? 1 : 0;
graph(boolean, 0, 1);
`,
        expected: "{}",
        alwaysShow: true,
        isVisualTest: true
    },
    {
        name: "graphing",
        input: `
// this feature is unpolished and in a very early stage (like most things here, but more-so).
// call the graph function with any number of functions, followed by a start and end value to graph it
graph(
	f(x) := sin(8 * x), 
	g(x) := cos(x), 
	0, 2*PI
)

// most of the javascript Math.whatever functions should be supported.
// although do keep in mind that some functions are not deterministic.
// the following function is different each time it is graphed
i := 0
random_boi(x) := { i += 0.1 * random(x)^6; i }
graph(
	random_boi,
	random_boi, 
	0, 10
)

// the graphing only happens after all code is ran. 
// So even though running random_boi is supposed to mutate i, i is still zero when we print it here
print(i)
`,
        expected: "{}",
        alwaysShow: true,
        isVisualTest: true
    },
    {
        name: "matrix multiplication",
        input: `
A := I(4);

v := [1,2,3,4]

A ** v`,
        expected: (ctx) => {
            const res = ctx.programResult;
            assert(res.vt === VT_TENSOR, "res.vt === VT_TENSOR");
            assert(res.shape.length === 1, "res.shape.length === 1");
            assert(res.shape[0] === 4, "res.shape[0] === 4");
            assert(res.data[0] === 1, "res.data[0] === 1");
            assert(res.data[1] === 2, "res.data[1] === 2");
            assert(res.data[2] === 3, "res.data[2] === 3");
            assert(res.data[3] === 4, "res.data[3] === 4");
        }
    },
    {
        name: "matrix transpose",
        input: `
A:= [[1,  2,  3], 
	 [1,  2,  3], 
	 [2,  4,  6]]
~A
`,

        expected: `shape: 3x3, data: 	[[1,  1,  2], 	 [2,  2,  4], 	 [3,  3,  6]]`
    },
    {
        name: "programming constructs - variable assignment",
        input: `
                // the := operator makes a new variable:
x := 1

// the = operator assigns to an existing variable:
x = 2

// this distinction makes more sense when we have multiple scopes. 
i := -42
for i := 0; i < 3; i=i+1 {
    // the i here is different from the i out there
	print(i)
}

// (it should still be -42)
i
`,
        expected: "-42",
        alwaysShow: true
    },
    {
        name: "programming constructs - blocks",
        input: `
// blocks are a list of expressions within curly braces {}.
// entire blocks are treated as expressions that are equal to the last line of the block
x := 2 * {
	y := 0;
    for i := 0; i < 10; i = i+1 {
        y += 1
    }
    y   // this here would be the last line of the block
};

x

`,
        expected: "20",
        alwaysShow: true
    },
    {
        name: "programming constructs - functions",
        input: `
// functions are defined as follows:

f(x) := x^2

// functions can call other functions or even themselves.
// functions can accept anything as arguments, including other functions.

g(y, func) := 2 * func(y)

g(2, f)
`,
        expected: "8",
        alwaysShow: true
    },
    {
        name: "function test",
        input: "fib(x) := x <= 1 ? 1 : fib(x - 1) + fib(x-2)\n\nfib(10)",
        expected: "89",
        alwaysShow: true
    },
    {
        name: "identity matrix for loop",
        input: "x := T(10, 10);\nfor i:=0; i < 10; i = i+1 {\n\tx[i][i]=1\n}\n\nx",
        expected:
            "shape: 10x10, data:[[1, 0, 0, 0, 0, 0, 0, 0, 0, 0],[0, 1, 0, 0, 0, 0, 0, 0, 0, 0],[0, 0, 1, 0, 0, 0, 0, 0, 0, 0],[0, 0, 0, 1, 0, 0, 0, 0, 0, 0],[0, 0, 0, 0, 1, 0, 0, 0, 0, 0],[0, 0, 0, 0, 0, 1, 0, 0, 0, 0],[0, 0, 0, 0, 0, 0, 1, 0, 0, 0],[0, 0, 0, 0, 0, 0, 0, 1, 0, 0],[0, 0, 0, 0, 0, 0, 0, 0, 1, 0],[0, 0, 0, 0, 0, 0, 0, 0, 0, 1]]"
    },
    {
        name: "for loop local scope",
        input: "x := 0;\nfor i := 0; i < 5; i=i+1 { x = x + 1; }\nfor i := 0; i < 5; i=i+1 { x = x + 1; }\nx",
        expected: "10"
    },
    {
        name: "for loop",
        input: "x := 0;\nfor i := 0; i < 5; i=i+1 { x = x + 1; }\nx",
        expected: "5"
    },
    {
        name: "basic indexing",
        input: "x := [[1,2,3], [4,5,6]]; x[1][0]",
        expected: "4"
    },
    {
        name: "identity matrix",
        input: "x := T(3,3); x[[[0,0],[1,1],[2,2]]] = [1,1,1]; x",
        expected: `	shape: 3x3, data: [[1, 0, 0], [0, 1, 0], [0, 0, 1]]`
    },
    {
        name: "test assigning to index",
        input: "x := [1,2,3]; x[0]=2; x\nx = T(2,3); x[0] = [1,2,3]; x",
        expected: `	shape: 2x3, data: [[1, 2, 3], [0, 0, 0]]`
    },
    {
        name: "indexing test 2",
        input: "[[1,2,3],[4,5,6]][0]",
        expected: "	shape: 3, data: [1, 2, 3]"
    },
    {
        name: "indexing with fewer dimensions should return tensor",
        input: "[[[1,2,3],[4,5,6]], [[4,4,4],[4,5,6]]][[0, 1]]",
        expected: "	shape: 2x3, data: [[1, 2, 3], [4, 5, 6]]"
    },
    {
        name: "order of operations",
        input: `1 * 2 + 3 * 2^2`,
        expected: "14"
    },
    {
        name: "brackets",
        input: `2^(1+1) + (2 * 3)`,
        expected: "10"
    },
    {
        name: "variables",
        input: `x := 3;
y := 33 * x;
x = y * x + x`,
        expected: "300"
    },
    {
        name: "assignment error",
        input: `y := 3; y := 3`,
        expected: "variable y already defined, with value: 3"
    },
    {
        name: "builtin math functions",
        input: "sin(PI) + cos(PI)",
        expected: "-0.9999999999999999"
    },
    {
        name: "Function wrong input type error",
        input: "sin(x)",
        expected: "the variable x hasn't been declared yet. You can do something like x := 2; to declare it."
    },
    {
        name: "line comments",
        input: "x := // 324234 * sin(x)\n3; x",
        expected: "3"
    },
    {
        name: "ternary",
        input: "0 ? 100 : 2^2",
        expected: "4"
    },
    {
        name: "inline tensor",
        input: "[[1, 2, 3], [1, 2, 3]]",
        expected: "shape: 2x3, data: [[1, 2, 3], [1, 2, 3]] "
    },
    {
        name: "tensor func",
        input: "T(10, 10)",
        expected: (ctx) => {
            assert(ctx.errors.length === 0, "Want no errors");
            const res = ctx.programResult;
            assert(
                res.shape[0] === 10 && res.shape[1] === 10,
                `wrong shape. We wanted 10x10 but got [${res.shape}] instead`
            );

            assert(res.data.length === 100, "wanted 100 items");
            for (let i = 0; i < 100; i++) {
                assert(res.data[i] === 0, "wanted all zeroes");
            }
        }
    }
];
