function OutputView(mountPoint, ctx) {
    const { outputPoint, shareBtn } = createComponent(
        mountPoint,
        `<div style="flex: 1">
            <div class="heading2 center">Output</div>
            <div style="display: flex; flex-direction: row-reverse; padding-right:20px;">
                <button --id="shareBtn">share link</button>
            </div>
            <div --id="outputPoint"></div>
        </div>`
    )

    shareBtn.addEventListener("click", () => alert("feature not yet implemented"))

    return { 
        component : outputPoint,
        renderOutputs : (programCtx) => {
            renderOutputs(outputPoint, programCtx);
        }
    };
}

// not good.
function SVG(mountPoint, options) {
    const {
        paths, texts, rects, 
        w, h, id
    } = options;

    const { root:svgRoot } = createComponent(
        mountPoint, 
        `<svg class="p-5 graph" style="width:${w}px;height:${h}px;>` +
            `<text class="mouseover mouse-pos-text" text-anchor="start" style="font-size:0.8em;"></text>` +
            `<path class="mouseover crosshair-path-1" stroke="grey" stroke-width="1"/>` +
            `<path class="mouseover crosshair-path-2" stroke="grey" stroke-width="1"/>` +
        `</svg>`
    )

    if(paths) {
        for(const p of paths) {
            createComponent(svgRoot, `<path class="${p.class || ""}" d="${p.p}" stroke="${p.s}" stroke-width="${p.w}px" fill="none"></path>`);
        }
    }

    if (texts) {
        for(const t of texts) {
            createComponent(svgRoot, `<text class="${t.class || ""}"text-anchor="${t.a}" x="${t.x}" y=${t.y} style="font-size:0.8em">${t.t}</text>`);
        }
    }

    if (rects) {
        for(const r of rects) {
            createComponent(svgRoot, `<rect class="${r.class || ""}" x=${r.x} y="${r.y}" width="${r.w}" height=${r.h} fill="${r.fill || "transparent"}" ></rect>`);
        }
    }
}

function renderOutputs(mountPoint, programCtx) {
    mountPoint.replaceChildren();

    if (programCtx.programResult.vt !== VT_NULL) {
        OutputTextResult(mountPoint, { title: "Final calculation result", val: programCtx.programResult });
    }

    // process and show all results, like Titled statements, graphs, etc.
    // we do it like this, so that we can still run unit tests without running side-effects
    if (programCtx.results.length > 0) {
        for(let i = 0; i < programCtx.results.length; i++) {
            const result = programCtx.results[i];
            if (result.rt === RT_PRINT) {
                OutputTextResult(mountPoint, result, i);
            } else if (result.rt === RT_PLOT) {
                OutputTextResult("Plotting has not been implemented yet");
            } else if (result.rt === RT_GRAPH) {
                graph(mountPoint, result, i);
            } else {
                p("unknown result type " + result.rt);
            }
        }
    }
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
    mountPoint.innerHTML += wrapInTitle(
        graphTitle,
        SVG(options)
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

function graph(mountPoint, result, i) {
    if (result.val && result.val.vt === VT_ERROR) {
        return OutputTextResult(mountPoint, result, i);
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
                OutputTextResult(mountPoint, { title: "An error occurred while graphing", val: num }, 0);
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

    addGraph(mountPoint, "graph of " + result.functions.map(f => f.name).join(", "), i, {
            w: w, h: h, id: "graph-" + i,
            paths: paths,
            texts: texts,
            rects: [{ x: leftPad, y: topPad, w: w, h: h - bottomPad - topPad, class: "graph-rect" }]
        }
    )

    mountPoint.innerHTML += `<div class="code indent-3"><b>Bounds: </b>${domainStart} < x < ${domainEnd}\t | \t${min} < y < ${max}</div>`
}