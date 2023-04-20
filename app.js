function App(mountPoint) {
    const { app, orientationPoint } = createComponent(
        mountPoint,
        `<div class="app" --id="app">
            <div --id="orientationPoint" style="display: flex; flex-direction: row;"></div>
        </div>`
    );

    const ctx = {
        lastText: null,
        lastAst: null,
        lastResult : null
    };

    const codeEditor = CodeEditor(orientationPoint, ctx); {
        codeEditor.component.style.width = "50%";
        codeEditor.onCodeChanged = (text, ast) => {
            ctx.lastAst = ast;
            ctx.lastText = text;
            // astDebug.innerText = JSON.stringify(ast, null, 4);
            ctx.lastResult = evaluateProgram(ast, text, {
                inputs: null
            });

            calculationRenderer.renderOutputs(ctx.lastResult);
        }
    }

    const calculationRenderer = OutputView(orientationPoint, ctx); {
        calculationRenderer.component.style.width = "50%";
        calculationRenderer.onInputValueChange = () => {
            ctx.lastResult = evaluateProgram(ctx.lastAst, ctx.lastText, {
                existingInputs: ctx.lastResult.inputs
            })

            calculationRenderer.renderOutputs(ctx.lastResult)
        }
    }

    const testingHarness = TestingHarness(app, ctx); {
        testingHarness.onTestcaseSelect = (testCase) => {
            window.scrollTo(0, 0);
            codeEditor.setCode(testCase.input.trim())
        };

        testingHarness.onWantRetest = () => {
            testingHarness.renderTests(testcases, false);
        }
    }

    testingHarness.renderTests(testcases, false);

    codeEditor.setCode(`// type your code here.\n// Or click on some examples below \n1 + 1`)
}