function OutputView(mountPoint, ctx) {
    const {
        root: component,
        outputPoint,
        shareBtn
    } = createComponent(
        mountPoint,
        `<div style="flex: 1">
            <div class="heading2 center">Output</div>
            <div style="display: flex; flex-direction: row-reverse; padding-right:20px;">
                <!-- <button --id="shareBtn">share link</button> -->
            </div>
            <div --id="outputPoint"></div>
        </div>`
    );

    // shareBtn.addEventListener("click", () => alert("feature not yet implemented"));

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
                OutputGraphResult(outputs, programCtx, result, i);
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

function OutputGraphResult(mountPoint, programCtx, result, i) {
    if (result.val && result.val.vt === VT_ERROR) {
        OutputTextResult(mountPoint, result, i);
        return;
    }

    const { root, canvasRoot, titleRoot } = createComponent(
        mountPoint,
        `<div class="output-graph-result">
            <div class="title" --id="titleRoot"></div>
            <div class="output-graph-result-canvas-container">
                <canvas --id="canvasRoot"></canvas>
            </div>
        </div>`
    );

    const domainStart = result.start.val;
    const domainEnd = result.end.val;
    let domainOffset = 0;

    const graphTitle = "graph of " + result.functions.map(f => f.name).join(", ");
    titleRoot.textContent = graphTitle;

    /** @type { CanvasRenderingContext2D } */
    const canvasRootCtx = canvasRoot.getContext("2d");
    canvasRootCtx.translate(0.5, 0.5); // allows 1-width lines to actually be 1 pixel wide

    let width, height;
    function rerenderGraph() {
        // evaluate the functions along the domains.
        // can reduce re-allocations by moving this out of the local fn
        const allResults = [];
        for (let fIndex = 0; fIndex < result.functions.length; fIndex++) {
            const results = [];
            allResults.push(results);

            const func = result.functions[fIndex];
            const subdivisions = Math.floor(width);
            evaluateFunction(
                func, 
                domainStart + domainOffset, 
                domainEnd + domainOffset,
                subdivisions, 
                (x, y) => {
                    results.push([x, y]);
                }
            );
        }

        renderPaths(allResults, canvasRootCtx, width, height);
    }

    onResize(canvasRoot.parentElement, (newWidth, newHeight) => {
        width = newWidth;
        height = newHeight;
        canvasRoot.width = width;
        canvasRoot.height = height;
        rerenderGraph();
    });


    const screenDeltaToDomainDeltaX = (x) => (x / width) * (domainEnd - domainStart);

    let domainStartX;
    onDrag(canvasRoot, {
        onDragStart() {
            domainStartX = domainOffset;
        },
        onDrag(dx, dy) {
            domainOffset = domainStartX - screenDeltaToDomainDeltaX(dx);
            rerenderGraph();
        }
    })
}

/** @param {CanvasRenderingContext2D} canvasRootCtx */
function renderPaths(pointLists, canvasRootCtx, canvasWidth, canvasHeight) {
    // Find graph extends
    let minX = null,
        minY = null,
        maxX = null,
        maxY = null;
    for (let i = 0; i < pointLists.length; i++) {
        const path = pointLists[i];
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

    // extend bounds by a tiny percent so the graph lines don't get cut off
    {
        const extendX = (maxX - minX) * 0.01;
        minX -= extendX; maxX += extendX;

        const extendY = (maxY - minY) * 0.01;
        minY -= extendY; maxY += extendY;
    }

    const domainXToScreenX = (x) => ((x - minX) / (maxX - minX)) * canvasWidth;
    const domainYToScreenY = (y) => (1 - (y - minY) / (maxY - minY)) * canvasHeight;

    // start rendering the graph.

    // graph bg
    // background
    {
        canvasRootCtx.fillStyle = `rgb(255, 255, 255)`;
        canvasRootCtx.fillRect(0, 0, canvasWidth, canvasHeight);
    }

    // Draw each of the paths
    for (let i = 0; i < pointLists.length; i++) {
        const path = pointLists[i];

        canvasRootCtx.strokeStyle = `hsl(${(360 * i) / pointLists.length}, 100%, 50%)`;
        canvasRootCtx.lineWidth = 2;
        canvasRootCtx.beginPath();

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

    // grid
    {
        canvasRootCtx.strokeStyle = `rgb(0, 0, 0, 0.5)`;
        canvasRootCtx.lineWidth = 1;

        const getGoodGridSpacing = (width) => {
            const nearestPowerOf2 = Math.pow(2, Math.floor(Math.log2(width) / Math.log2(2)) - 1);
            const nearestPowerOf5 = Math.pow(5, Math.floor(Math.log2(width) / Math.log2(5)) - 1);
            const nearestPowerOf10 = Math.pow(10, Math.floor(Math.log2(width) / Math.log2(10)) - 1);

            const spacingCounts = [nearestPowerOf2, nearestPowerOf5, nearestPowerOf10];
            spacingCounts.sort();

            if (width / spacingCounts[2] > 5) return spacingCounts[2];
            if (width / spacingCounts[1] > 5) return spacingCounts[1];

            return spacingCounts[0];
        };

        canvasRootCtx.beginPath();
        const gridXSpacing = getGoodGridSpacing(maxX - minX);
        const gridYSpacing = getGoodGridSpacing(maxY - minY);
        const startX = Math.floor(minX / gridXSpacing) * gridXSpacing;
        for (let x = startX; x < maxX; x += gridXSpacing) {
            const screenX = domainXToScreenX(x);
            canvasRootCtx.moveTo(screenX, 0);
            canvasRootCtx.lineTo(screenX, canvasHeight);
        }
        const startY = Math.floor(minY / gridYSpacing) * gridYSpacing;
        for (let y = startY; y < maxY; y += gridYSpacing) {
            const screenY = domainYToScreenY(y);
            canvasRootCtx.moveTo(0, screenY);
            canvasRootCtx.lineTo(canvasWidth, screenY);
        }
        canvasRootCtx.stroke();

        // Draw axes numbers
        {
            const round = (x) => (Math.round(x * 10) / 10).toFixed(1);

            const fontSize = 14;
            canvasRootCtx.font = `${fontSize}px monospace`;
            canvasRootCtx.fillStyle = `rgb(0,0,0)`;
            canvasRootCtx.textAlign = "center";

            for (let x = startX; x < maxX; x += gridXSpacing) {
                canvasRootCtx.fillText(round(x), domainXToScreenX(x), domainYToScreenY(minY) - fontSize + 4);
            }

            canvasRootCtx.textAlign = "start";
            for (let y = startY; y < maxY; y += gridYSpacing) {
                canvasRootCtx.fillText(round(y), domainXToScreenX(minX) + 4, domainYToScreenY(y) - 2);
            }
        }
    }
}
