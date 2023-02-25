function App(mountPoint) {
    const { app, orientationPoint } = createComponent(
        mountPoint,
        `<div class="app" --id="app">
            <div --id="orientationPoint" style="display: flex; flex-direction: row;"></div>
        </div>`
    );

    // Acts as the app's 'global' state while not actually being global.
    const ctx = {};

    const codeEditor = CodeEditor(orientationPoint, ctx); {
        codeEditor.component.style.width = "50%";
        codeEditor.onCodeChanged = (text, ast) => {
            // astDebug.innerText = JSON.stringify(ast, null, 4);
            const result = evaluateProgram(ast, text);
            calculationRenderer.renderOutputs(result);
        }
    }

    const calculationRenderer = OutputView(orientationPoint, ctx); {
        calculationRenderer.component.style.width = "50%";
    }

    const testingHarness = TestingHarness(app, ctx); {
        testingHarness.onTestcaseSelect = (testCase) => {
            window.scrollTo(0, 0);
            codeEditor.setCode(testCase.input.trim())
        }
    }

    testingHarness.renderTests(testcases, false);

    codeEditor.setCode(`// type your code here.\n// Or click on some examples below \n1 + 1`)
}