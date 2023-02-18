// <!-- Not intended to be an actual calculator. It is practice for creating a parser to making a
// programming language that I have been thinking about for a while now. This won't be the actual language, nor
// will it be complete, but I will try to add some cool features. I don't intend to spend any
// more than around 4 days on this site. (actually I ended up spending 2-3 weeks on it, and I will probably keep adding to it
// if I actually end up using it) -->

function App(mountPoint) {
    const { component:app, zoneModeToggleBtn } = createComponent(
        mountPoint,
        `<div class="app">
            <div style="font-size:28px;font-weight:bold;padding-left:10px;">Calculator</div>
            <div class="not-important" style="padding: 10px">
                <div>
                    <p>
                        This was originally supposed to be a simple calculator that only supported simple +-*/ operations and brackets, but I
                        got a bit carried away and now it's a programming language???
                        Type something into the box, or click on one of the examples in the table below.
                    </p>
                </div>
                <div style="margin-top: 50px; padding: 10px">
                    <button --id="zoneModeToggleBtn" style="width: unset">Remove clutter</button>
                </div>
            </dov>
        </div>`
    );

    const codeEditor = CodeEditor(app);
    const { renderOutputs: renderCalculationResult } = CalculationRenderer(app);
    const testingHarness = TestingHarness(app);

    codeEditor.onCodeChanged = (text, ast) => {
        // astDebug.innerText = JSON.stringify(ast, null, 4);
        const result = evaluateProgram(ast, text);
        renderCalculationResult(result);
    }

    testingHarness.onTestcaseSelect = (testCase) => {
        window.scrollTo(0, 0);
        codeEditor.setCode(testCase.input.trim())
    }

    zoneModeToggleBtn.addEventListener("click", () => {
        app.classList.toggle("hide-not-important")
    });

    const hideNotImportantOnEsc = (e) => {
        if (e.key === "Escape") {
            app.classList.toggle("hide-not-important");
        }
    };

    document.addEventListener("keydown", hideNotImportantOnEsc);

    testingHarness.renderTests(testcases, false);

    return {
        cleanup: () => {
            document.removeEventListener("keydown", hideNotImportantOnEsc);
        }
    }
}


function CalculationRenderer(mountPoint) {
    const { component:stdout } = createComponent(
        mountPoint,
        `<div></div>`
    )

    function renderSVG(options) {
        const {
            paths, texts, rects, 
            w, h, id
        } = options;

        return (
            `<svg id="${id || (1000 * Math.random()).toFixed(0)}" class="p-5 graph" style="width:${w}px;height:${h}px;">
                <text class="mouseover mouse-pos-text" text-anchor="start" style="font-size:0.8em;"></text>
                <path class="mouseover crosshair-path-1" stroke="grey" stroke-width="1"/>
                <path class="mouseover crosshair-path-2" stroke="grey" stroke-width="1"/>

                ${!paths ? "" : paths.map(p => `<path class="${p.class || ""}" d="${p.p}" stroke="${p.s}" stroke-width="${p.w}px" fill="none"></path>`).join("\n")}
                ${!texts ? "" : texts.map(t => `<text class="${t.class || ""}"text-anchor="${t.a}" x="${t.x}" y=${t.y} style="font-size:0.8em">${t.t}</text>`).join("\n")}
                ${!rects ? "" : rects.map(r => `<rect class="${r.class || ""}" x=${r.x} y="${r.y}" width="${r.w}" height=${r.h} fill="${r.fill || "transparent"}" ></rect>`)}
                </svg>`
        );
    }

    function renderOutputs(programCtx) {
        function p(innerHTML, className = "", el="p") {
            return `<${el} class="p-5 m-0 code ${className}">${sanitizeHTML(innerHTML)}</${el}>`;
        };

        function wrapInTitle(title, innerHtml) {
            return (
                `<div class="flex-row">` + 
                    (title ? `<p class="p-5 m-0 label"><b>${title}: </b></p>` : "") + 
                    innerHtml +
                "</div>"
            );
        }

        function print(stdout, result, i) {
            stdout.innerHTML += wrapInTitle(
                result.title || `result ${i}`, 
                p(thingToString(result.val), result.val.vt === VT_ERROR ? "error" : "")
            );
        }

        function plot(stdout, xValues, yValues) {
            // TODO: move code from function graph into here
        }

        function addGraph(stdout, graphTitle, i, options) {
            stdout.innerHTML += wrapInTitle(
                graphTitle,
                renderSVG(options)
            );

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
                    crosshairPath1.setAttribute("d", `M ${leftPad} ${viewY} L ${w} ${viewY}`)
                    crosshairPath2.setAttribute("d", `M ${viewX} ${topPad} L ${viewX} ${h - bottomPad}`)
                });

                graphRect.addEventListener("mouseenter", (e) => {
                    mouseOverElements.forEach(e => e.removeAttribute("hidden"));
                });

                graphRect.addEventListener("mouseleave", (e) => {
                    mouseOverElements.forEach(e => e.setAttribute("hidden", true));
                });
            }, 5);
        }

        function graph(stdout, result, i) {
            if (result.val && result.val.vt === VT_ERROR) {
                return print(stdout, result, i);
            }

            const domainStart = result.start.val;
            const domainEnd = result.end.val;

            const paths = [], texts = [];

            const padding = 50;
            const w = 1000;
            const h = 500;
            const n = Math.floor(w);
            const points = Array(n * result.functions.length);
            
            // find graph bounds by evaluating functions
            let min = -20, max = -20;
            for(let fIndex = 0; fIndex < result.functions.length; fIndex++) {
                const func = result.functions[fIndex];
                programCtx.variables.pushStackFrame();
                // set captures to values
                for (let i = 0; i < func.captures.length; i++) {
                    programCtx.variables.set(programCtx, func.captures[i][0], func.captures[i][1], ASSIGN_DECLARE, true);
                }

                const fRef = makeNumber(0);
                programCtx.variables.set(programCtx, func.args[0], fRef, ASSIGN_DECLARE);

                for(let i = 0; i < n; i++) {
                    const tX = (i / (n - 1));

                    fRef.val = lerp(domainStart, domainEnd, tX);
                    
                    programCtx.variables.pushStackFrame();

                    const num = evaluateBlock(programCtx, func.body);

                    programCtx.variables.popStackFrame();

                    if (num.vt === VT_ERROR) {
                        print(stdout, { title: "An error occurred while graphing", val: num }, 0);
                        return;
                    }
                    const domainY = num.val;
                    
                    points[i + fIndex*n] = domainY;
                }

                programCtx.variables.popStackFrame();
                
                if (fIndex === 0) {
                    min = points[0];
                    max = points[0];
                }

                for(let i = 0; i < n; i++) {
                    min = points[i + fIndex*n] < min ? points[i + fIndex*n] : min;
                    max = points[i + fIndex*n] > max ? points[i + fIndex*n] : max;
                }
            }

            const leftPad = 100, bottomPad = 17, topPad = 5;

            const axesOverhang = 10;
            // draw graph axes
            paths.push(
                { p: `M ${leftPad - axesOverhang} ${h - bottomPad} L ${w} ${h - bottomPad}`, s: `black`, w: 1 },
                { p: `M ${leftPad} ${h - bottomPad + axesOverhang} L ${leftPad} ${topPad}`, s: `black`, w: 1 },
                { p: `M ${leftPad - axesOverhang} ${topPad} L ${w} ${topPad}`, s: `grey`, w: 1 },
                { p: `M ${w} ${h - bottomPad + axesOverhang} L ${w} ${topPad}`, s: `grey`, w: 1 },
            );

            texts.push (
                { t: `${min.toFixed(2)}`, x: leftPad - axesOverhang, y: h - bottomPad - axesOverhang, a: "end" },
                { t: `${max.toFixed(2)}`, x: leftPad - axesOverhang, y: bottomPad + topPad, a: "end" },

                { t: `${domainStart.toFixed(2)}`, x: leftPad + axesOverhang, y: h, a: "start" },
                { t: `${domainEnd.toFixed(2)}`, x: w - axesOverhang, y: h, a: "end" },
            );

            // draw graph
            for(const fIndex in result.functions) {
                const func = result.functions[fIndex];
                const path = [];
                for(let i = 0; i < n; i++) {
                    const tX = (i / (n - 1));
                    let x = leftPad + tX * (w - leftPad);
                    let y = topPad + (h - bottomPad - topPad) * (1 - (points[i + fIndex*n] - min) / (max - min));

                    if (i === 0) {
                        path.push("M" + x + " " + y);
                    } else {
                        path.push("L" + x + " " + y);
                    }
                }

                paths.push({ p: path.join(" ") , s: `hsl(${360 * fIndex / result.functions.length}, 100%, 50%)`, w: 2 });
            }

            addGraph(stdout, "graph of " + result.functions.map(f => f.name).join(", "), i, {
                    w: w, h: h, id: "graph-" + i,
                    paths: paths,
                    texts: texts,
                    rects: [{ x: leftPad, y: topPad, w: w, h: h - bottomPad - topPad, class: "graph-rect" }]
                }
            )

            stdout.innerHTML += `<div class="code indent-3"><b>Bounds: </b>${domainStart} < x < ${domainEnd}\t | \t${min} < y < ${max}</div>`
        }

        const outputs = [];
        stdout.innerHTML = "";

        if (programCtx.programResult.vt !== VT_NULL) {
            outputs.push(print(stdout, { title: "Calculation result", val: programCtx.programResult }));
        }

        // process and show all results, like print statements, graphs, etc.
        // we do it like this, so that we can still run unit tests without running side-effects
        if (programCtx.results.length > 0) {
            for(let i = 0; i < programCtx.results.length; i++) {
                const result = programCtx.results[i];
                if (result.rt === RT_PRINT) {
                    print(stdout, result, i);
                } else if (result.rt === RT_PLOT) {
                    p("TODO");
                } else if (result.rt === RT_GRAPH) {
                    graph(stdout, result, i);
                } else {
                    p("unknown result type " + result.rt);
                }

                stdout.innerHTML += "\n";
            }
        }
    }


    return { renderOutputs };
}

