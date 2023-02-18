appendStyles(`
.code {
    white-space: pre-wrap;
    tab-size: 4;
    line-height: 1.4rem;
}

.code div:before {
    content: "|";
    width: 20px;
}

.med {
    font-size: 1.2rem;
}

.line-numbers {
    color: #aaaaaa;
    background: #000000;
    outline: none;
    border-right: 1px solid #aaaaaa;
    padding: 5px;
    min-height: 60px;
}

.input {
    padding-left: 5px;
    font-family: 'Source Code Pro', monospace;
    background: #000000;
    color: #ffffff;
    white-space: pre;
    min-height: 60px;
    tab-size: 4;
    line-height: 1.4rem;
}

.input.editing {
    z-index: 1;
    color: transparent;
    background: transparent;
    caret-color: white;
}

.input.highlighting {
    z-index: 0;
    
}

/* Someone else's very clever approach to syntax highlighting that I copied:
     https://css-tricks.com/creating-an-editable-textarea-that-supports-syntax-highlighted-code/ */
.input.editing,
.input.highlighting {
    position: absolute;
    top: 0; left: 0;
    width: 100%;
    height: calc(100% - 5px);
    padding: 0;
    padding-left: 5px;
    padding-top: 5px;
    border: 0;
}
`)


/** This text editor also performs syntax highlighting */
function CodeEditor(mountPoint) {
    const { input, lineNumbers, syntaxHighlightedView } = createComponent(
        mountPoint,
        `<div style="display: flex; flex-direction: row">
            <div --id="lineNumbers" class="code med line-numbers"></div>
            <div style="flex: 1; position:relative;">
                <textarea --id="input" class="input editing code med" spellcheck="false"></textarea>
                <div class="input highlighting code med" --id="syntaxHighlightedView"></div>
            </div>
        </div>`
    );

    const state = {
        onCodeChanged: () => { console.log("onCodeChanged not yet subscribed to"); },
        setCode: (text) => {
            input.value = text;
            
            // line numbers are propping up the textarea
            lineNumbers.innerText = [...Array(text.split("\n").length).keys()].join("\n");

            const ast = parseProgram(text);
            highlightSyntax(syntaxHighlightedView, text, ast);

            state.onCodeChanged(text, ast);
        },
        getText: () => input.value
    }

    const textChanged = () => state.setCode(input.value);
    input.addEventListener("input", textChanged);
    input.addEventListener("changed", textChanged);
    
    // HTML doesn't like tabs, we need this additional code to be able to insert tabs.
    input.addEventListener("keydown", (e) => {
        if (e.keyCode !== 9) return;
        
        e.preventDefault();
        
        // inserting a tab like this should preserve undo
        // TODO: stop using deprecated API
        document.execCommand("insertText", false, "\t");
        
        textChanged();
    });
    
    textChanged();

    return state;
}

function getSyntaxHighlightStyle(t) {
    switch (t) {
        case "comment":
            return "color:#AAAAAA;";
        case T_NUMBER:
            return "color:#3ABEFF;";
        case T_STRING:
            return "color:#FF7F00;";
        case T_OP_COMPARISON:
        case T_OP_EXPONENT:
        case T_OP_EXPR:
        case T_OP_TERM:
            return "color:#FFFFFF;";
        case T_IDENT:
            return "color:#FFE03B;font-style:italic;";
        case T_FOR_LOOP:
        case T_BLOCK:
            return "color:#FF00FF;";
        case T_ASSIGNMENT:
            return "color:#00FF00";
        default:
            return "color:#FFFFFF;";
    }
}

const commentStyle = getSyntaxHighlightStyle("comment");

// TODO: code this without using sanitizeHTML deprecated func
function highlightSyntax(mountPoint, text, ast) {
    // perform syntax highlighting ourselves, since no JS library supports our language at the moment
    let strings = [];
    let pos = 0;

    const advanceHighlightToPos = (advancePos) => {
        while (pos < advancePos) {
            let startPos = pos;
            // we wrap whitespace in the comment style. this is because comments are treated as whitespace
            pos = advanceWhileWhitespace(text, pos);
            if (startPos !== pos) {
                strings.push(`<span style="${commentStyle}">`);
                strings.push(sanitizeHTML(text.substring(startPos, pos)));
                strings.push("</span>");
            }

            // there are also non-whitespace characters that need to have the style of the parent element, so
            // we simply don't wrap it in anything
            startPos = pos;
            while (pos < advancePos && !isWhitespace(text[pos])) {
                pos += 1;
            }
            if (startPos !== pos) {
                strings.push(text.substring(startPos, pos));
            }
        }
    };

    // I cant believe this works
    const dfs = (node) => {
        advanceHighlightToPos(node.start);

        // then we warp the node itself in it's respective style
        const style = getSyntaxHighlightStyle(node.t);
        strings.push(`<span style="${style}">`);

        // this should recursively push the inner node text/styles
        const keys = getKeysForAstNodeType_Ordered(node.t);
        if (keys === null) {
            if (pos > node.end) {
                throw new Error("couldn't highlight syntax, wrong node.start somewhere up the chain");
            }
            strings.push(sanitizeHTML(text.substring(pos, node.end)));
            pos = node.end;
        } else {
            for (const key of keys) {
                const subNode = node[key];

                if (!subNode) {
                    throw new Error("subnode was undefined");
                }

                if (typeof subNode.length === "number") {
                    // it is most likely an array. (in our case 100%, actually)
                    for (const subNodeItem of subNode) {
                        dfs(subNodeItem, pos);
                    }
                } else {
                    dfs(subNode);
                }
            }
        }

        advanceHighlightToPos(node.end);

        // closing tag for the styles we pushed earlier
        strings.push(`</span>`);
    };

    for (let i = 0; i < ast.expressions.length; i++) {
        dfs(ast.expressions[i], pos);
    }

    // if we couldn't AST the file all the way to the end, we should still be displaying all the text
    advanceHighlightToPos(text.length);

    mountPoint.innerHTML = strings.join("");
}
