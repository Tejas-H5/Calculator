function OutputView(mountPoint, ctx) {
    const { root: component, outputPoint, shareBtn } = createComponent(
        mountPoint,
        `<div style="flex: 1">
            <div class="heading2 center">Output</div>
            <div style="display: flex; flex-direction: row-reverse; padding-right:20px;">
                <button --id="shareBtn">share link</button>
            </div>
            <div --id="outputPoint"></div>
        </div>`
    );

    shareBtn.addEventListener("click", () => alert("feature not yet implemented"));

    return {
        component: component,
        renderOutputs: (programCtx) => {
            renderOutputs(outputPoint, programCtx);
        }
    };
}

function renderOutputs(mountPoint, programCtx) {
    const outputs = [];

    if (programCtx.programResult.vt !== VT_NULL) {
        OutputTextResult(outputs, { title: "Final calculation result", val: programCtx.programResult });
    }

    // process and show all results, like Titled statements, graphs, etc.
    // we do it like this, so that we can still run unit tests without running side-effects
    if (programCtx.results.length > 0) {
        for (let i = 0; i < programCtx.results.length; i++) {
            const result = programCtx.results[i];
            if (result.rt === RT_PRINT) {
                OutputTextResult(outputs, result, i);
            } else if (result.rt === RT_PLOT) {
                OutputTextResult("Plotting has not been implemented yet");
            } else if (result.rt === RT_GRAPH) {
                Graph(outputs, result, i);
            } else {
                p("unknown result type " + result.rt);
            }
        }
    }

    replaceChildren(mountPoint, outputs);
}

function OutputTextResult(mountPoint, result, i) {
    const { root, titleRoot, valueRoot } = createComponent(
        mountPoint,
        `<div class="output-text-result">
            <div class="title" --id="titleRoot"></div>
            <div class="value" --id="valueRoot"></div>
        </div>`
    );

    const titleStr = result.title || `result ${i}`;
    titleRoot.textContent = titleStr + ": ";

    const valueStr = thingToString(result.val);
    valueRoot.innerText = valueStr;
    if (result.val.vt === VT_ERROR) {
        valueRoot.classList.add("error");
    }
}

function plot(mountPoint, xValues, yValues) {
    // TODO: move code from function graph into here
}

function addGraph(mountPoint, graphTitle, i, options) {
    mountPoint.innerHTML += wrapInTitle(graphTitle, SVG(options));

    setTimeout(() => {
        const graph = document.getElementById("graph-" + i);
        const mousePosText = graph.querySelector(".mouse-pos-text");
        const graphRect = graph.querySelector(".graph-rect");
        const crosshairPath1 = graph.querySelector(".crosshair-path-1");
        const crosshairPath2 = graph.querySelector(".crosshair-path-2");

        const mouseOverElements = graph.querySelectorAll(".mouseover");
        graphRect.addEventListener("mousemove", (e) => {
            const scrollAmnt = document.documentElement.scrollTop || document.body.scrollTop;
            const rect = graphRect.getBoundingClientRect();
            const rect2 = graph.getBoundingClientRect();

            const tX = event.pageX - rect.left;
            const tY = event.pageY - rect.top - scrollAmnt;

            const domainX = lerp(domainStart, domainEnd, tX / (w - leftPad)).toFixed(3);
            const domainY = lerp(max, min, tY / (h - bottomPad - topPad)).toFixed(3);

            const viewX = event.pageX - rect2.left - 5;
            const viewY = event.pageY - rect2.top - 5 - scrollAmnt;

            mousePosText.innerHTML = domainX + ", " + domainY;
            mousePosText.setAttribute("x", viewX + axesOverhang);
            mousePosText.setAttribute("y", viewY - axesOverhang);
            crosshairPath1.setAttribute("d", `M ${leftPad} ${viewY} L ${w} ${viewY}`);
            crosshairPath2.setAttribute("d", `M ${viewX} ${topPad} L ${viewX} ${h - bottomPad}`);
        });

        graphRect.addEventListener("mouseenter", (e) => {
            mouseOverElements.forEach((e) => e.removeAttribute("hidden"));
        });

        graphRect.addEventListener("mouseleave", (e) => {
            mouseOverElements.forEach((e) => e.setAttribute("hidden", true));
        });
    }, 5);
}

function evaluateFunction(func, domainStart, domainEnd, subdivisions, evalFn) {
    const n = subdivisions + 2;

    const programCtx = createProgramContext("");
    // Initialize the function's capture variables
    programCtx.variables.pushStackFrame();
    for (let i = 0; i < func.captures.length; i++) {
        programCtx.variables.set(programCtx, func.captures[i][0], func.captures[i][1], ASSIGN_DECLARE, true);
    }
    // this number will be the first argument into the function. We are assuming all functions here only take 1 argument
    const fRef = makeNumber(0);
    programCtx.variables.set(programCtx, func.args[0], fRef, ASSIGN_DECLARE);

    for (let i = 0; i <= n; i++) {
        const domainX = lerp(domainStart, domainEnd, i / n);
        fRef.val = domainX;

        programCtx.variables.pushStackFrame();

        // This is not necessarily a number ??? TODO: handle other cases
        const num = evaluateBlock(programCtx, func.body);

        programCtx.variables.popStackFrame();

        if (num.vt === VT_ERROR) {
            OutputTextResult(mountPoint, { title: "An error occurred while graphing", val: num }, 0);
            return;
        }

        const domainY = num.val;
        evalFn(domainX, domainY, i);
    }

    programCtx.variables.popStackFrame();
}

function Graph(mountPoint, result, i) {
    if (result.val && result.val.vt === VT_ERROR) {
        OutputTextResult(mountPoint, result, i);
        return;
    }

    const { root, canvasRoot } = createComponent(
        mountPoint,
        `<div style="height: 350px">
            <canvas --id="canvasRoot" style="position: absolute;"></canvas>
        </div>`
    );

    const domainStart = result.start.val;
    const domainEnd = result.end.val;

    /** @type { CanvasRenderingContext2D } */
    const canvasRootCtx = canvasRoot.getContext("2d");

    onResize(root, (width, height) => {
        canvasRoot.width = width;
        canvasRoot.height = height;

        // evaluate the functions along the domains
        const allResults = [];
        for (let fIndex = 0; fIndex < result.functions.length; fIndex++) {
            const results = [];
            allResults.push(results);

            const func = result.functions[fIndex];
            const subdivisions = Math.floor(width);
            evaluateFunction(func, domainStart, domainEnd, subdivisions, (x, y) => {
                results.push([x, y]);
            });
        }

        // Find graph extends
        let minX = null,
            minY = null,
            maxX = null,
            maxY = null;
        for (let i = 0; i < allResults.length; i++) {
            const path = allResults[i];
            for (let j = 0; j < path.length; j++) {
                const [x, y] = path[j];

                if (i === 0 && j === 0) {
                    minX = x;
                    maxX = x;
                    minY = y;
                    maxY = y;
                }

                minX = x < minX ? x : minX;
                minY = y < minY ? y : minY;
                maxX = x > maxX ? x : maxX;
                maxY = y > maxY ? y : maxY;
            }
        }

        const domainXToScreenX = (x) => ((x - minX) / (maxX - minX)) * width;
        const domainYToScreenY = (y) => ((y - minY) / (maxY - minY)) * height;

        // start rendering the graph. 

        // graph bg:
        canvasRootCtx.fillStyle = `rgb(255, 255, 255)`;
        canvasRootCtx.fillRect(0, 0, width, height);

        canvasRootCtx.strokeStyle = `rgb(0, 0, 0, 0.5)`;
        canvasRootCtx.lineWidth = 0.5 + "px";

        // funny that my program is actually useful for rewriting my program
        // height := slider(350, 0, 10, 100, "slider");
        // height := 600
        // nearestPowerOf10 := 10 ^ floor(log(height) / log(10))
        // nearestPowerOf5 := 5 ^ floor(log(height) / log(5))
        // nearestPowerOf2 := 2 ^ floor(log(height) / log(2))
        // print(height / nearestPowerOf10);
        // print(height / nearestPowerOf5);
        // print(height / nearestPowerOf2);
        // print(max(
        // 	height / nearestPowerOf10, 
        // 	height / nearestPowerOf5, 
        // 	height / nearestPowerOf2))

        const gridSize = (domainEnd - domainStart)

        canvasRootCtx.beginPath();
        for (let i = 0; i < 10; i++) {
            const x = (i / 10) * width;
            canvasRootCtx.moveTo(x, 0);
            canvasRootCtx.lineTo(x, height);

            const y = (i / 10) * height;
            canvasRootCtx.moveTo(0, y);
            canvasRootCtx.lineTo(width, y);
        }
        canvasRootCtx.stroke();
        

        // Draw each of the paths
        for (let i = 0; i < allResults.length; i++) {
            const path = allResults[i];

            canvasRootCtx.strokeStyle = `hsl(${(360 * i) / allResults.length}, 100%, 50%)`;
            canvasRootCtx.lineWidth = 2;
            canvasRootCtx.beginPath();

            const pathStr = [];
            for (let j = 0; j < path.length; j++) {
                const [resultX, resultY] = path[j];

                const x = domainXToScreenX(resultX);
                const y = domainYToScreenY(resultY);

                if (j === 0) {
                    canvasRootCtx.moveTo(x, y);
                } else {
                    canvasRootCtx.lineTo(x, y);
                }
            }

            canvasRootCtx.stroke();
        }
    });
}
