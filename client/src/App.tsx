import { useState, useEffect } from "react";
import { DocHandle, Repo } from "@automerge/automerge-repo";
// import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb";
import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import {
    RepoContext,
    useRepo,
} from "@automerge/automerge-repo-react-hooks";
import { MappedNodeSpec, SchemaAdapter } from "@automerge/prosemirror";
import { BlockMarker } from "@automerge/prosemirror/dist/types";
import { DOMOutputSpec, Mark, Node, NodeSpec } from "prosemirror-model";
import { Editor } from "./Editor";
import "./playground.css"
import "@benrbray/prosemirror-math/dist/prosemirror-math.css";
import "katex/dist/katex.min.css";
import { defaultBlockMathParseRules, defaultInlineMathParseRules } from "@benrbray/prosemirror-math";

const repo = new Repo({
    // storage: new IndexedDBStorageAdapter("automerge-demo"),
    // ??
    // @ts-ignore
    network: [new BrowserWebSocketClientAdapter("ws://localhost:8080")],
});

export default function App() {
    const [documentId, setDocumentId] = useState<string | null>(null);

    useEffect(() => {
        fetch("http://localhost:8080/document-id")
            .then((res) => res.json())
            .then((data: { documentId: string }) => {
                setDocumentId(data.documentId);
            });
    }, []);

    if (!documentId) {
        return <div>Loading document ID…</div>;
    }

    return (
        <RepoContext.Provider value={repo}>
            <EditorWrapper documentId={documentId} />
        </RepoContext.Provider>
    );
}

function EditorWrapper({ documentId }: { documentId: string }) {
    const repo = useRepo();
    const [handle, setHandle] = useState<DocHandle<any> | null>(null);
    useEffect(() => {
        repo.find(documentId).then((h: any) => {
            setHandle(h);
        });
    }, [documentId])


    if (!handle) return <div>Loading document…</div>;

    return (

        <div className="editor">
            <Editor
                name="left"
                handle={handle}
                path={["text"]}
                schemaAdapter={paragraphAndHeadingSchemaAdapter}
            />
        </div>
    );
}


// basics
const pDOM: DOMOutputSpec = ["p", 0];
const blockquoteDOM: DOMOutputSpec = ["blockquote", 0];
const hrDOM: DOMOutputSpec = ["hr"];
const preDOM: DOMOutputSpec = ["pre", ["code", 0]];

// marks
const emDOM: DOMOutputSpec = ["em", 0];
const strongDOM: DOMOutputSpec = ["strong", 0];
const codeDOM: DOMOutputSpec = ["code", 0];

// lists
const olDOM: DOMOutputSpec = ["ol", 0];
const ulDOM: DOMOutputSpec = ["ul", 0];
const liDOM: DOMOutputSpec = ["li", 0];


const paragraphAndHeadingSchemaAdapter = new SchemaAdapter({
    nodes: {

        doc: {
            content: "block+",
        } as NodeSpec,

        /// A plain paragraph textblock. Represented in the DOM
        /// as a `<p>` element.
        paragraph: {
            automerge: {
                block: "paragraph",
            },
            content: "inline*",
            group: "block",
            parseDOM: [{ tag: "p" }],
            toDOM() {
                return pDOM;
            },
        } as NodeSpec,

        unknownBlock: {
            automerge: {
                unknownBlock: true,
            },
            group: "block",
            content: "block+",
            parseDOM: [{ tag: "div", attrs: { "data-unknown-block": "true" } }],
            toDOM() {
                return ["div", { "data-unknown-block": "true" }, 0];
            },
        },


        // math_inline and math_display taken from here: https://github.com/benrbray/prosemirror-math/blob/master/lib/math-schema.ts
        // and added automerge block
        math_inline: {
            automerge: {
                block: "math_inline",
                isEmbed: true,
            },
            group: "inline",
            content: "text*",
            inline: true,
            atom: false,
            toDOM: () => ["math-inline", { class: "math-node" }, 0],
            parseDOM: [
                {
                    tag: "math-inline",
                },
                ...defaultInlineMathParseRules,
            ],
        },
        math_display: {
            automerge: {
                block: "math_display",
            },
            group: "block math",
            content: "text*",
            atom: true,
            code: true,
            toDOM: () => ["math-display", { class: "math-node" }, 0],
            parseDOM: [
                {
                    tag: "math-display",
                },
                ...defaultBlockMathParseRules,
            ],
        },

        /// A blockquote (`<blockquote>`) wrapping one or more blocks.
        blockquote: {
            automerge: {
                block: "blockquote",
            },
            content: "block+",
            group: "block",
            defining: true,
            parseDOM: [{ tag: "blockquote" }],
            toDOM() {
                return blockquoteDOM;
            },
        } as NodeSpec,

        /// A horizontal rule (`<hr>`).
        horizontal_rule: {
            group: "block",
            parseDOM: [{ tag: "hr" }],
            toDOM() {
                return hrDOM;
            },
        } as NodeSpec,

        /// A heading textblock, with a `level` attribute that
        /// should hold the number 1 to 6. Parsed and serialized as `<h1>` to
        /// `<h6>` elements.
        heading: {
            automerge: {
                block: "heading",
                attrParsers: {
                    fromAutomerge: (block) => ({ level: block.attrs.level }),
                    fromProsemirror: (node) => ({ level: node.attrs.level }),
                },
            },
            attrs: { level: { default: 1 } },
            content: "inline*",
            group: "block",
            defining: true,
            parseDOM: [
                { tag: "h1", attrs: { level: 1 } },
                { tag: "h2", attrs: { level: 2 } },
                { tag: "h3", attrs: { level: 3 } },
                { tag: "h4", attrs: { level: 4 } },
                { tag: "h5", attrs: { level: 5 } },
                { tag: "h6", attrs: { level: 6 } },
            ],
            toDOM(node) {
                return [`h${node.attrs.level}`, 0];
            },
        },

        /// A code listing. Disallows marks or non-text inline
        /// nodes by default. Represented as a `<pre>` element with a
        /// `<code>` element inside of it.
        code_block: {
            automerge: {
                block: "code-block",
            },
            content: "text*",
            marks: "",
            group: "block",
            code: true,
            defining: true,
            parseDOM: [{ tag: "pre", preserveWhitespace: "full" }],
            toDOM() {
                return preDOM;
            },
        } as NodeSpec,

        /// The text node.
        text: {
            group: "inline",
        } as NodeSpec,


        ordered_list: {
            group: "block",
            content: "list_item+",
            attrs: { order: { default: 1 } },
            parseDOM: [
                {
                    tag: "ol",
                    getAttrs(dom: HTMLElement) {
                        return {
                            order: dom.hasAttribute("start")
                                ? // biome-ignore lint/style/noNonNullAssertion: it was this way in the prosemirror example
                                +dom.getAttribute("start")!
                                : 1,
                        };
                    },
                },
            ],
            toDOM(node) {
                return node.attrs.order === 1 ? olDOM : ["ol", { start: node.attrs.order }, 0];
            },
        } as NodeSpec,

        bullet_list: {
            content: "list_item+",
            group: "block",
            parseDOM: [{ tag: "ul" }],
            toDOM() {
                return ulDOM;
            },
        },

        /// A list item (`<li>`) spec.
        list_item: {
            automerge: {
                block: {
                    within: {
                        ordered_list: "ordered-list-item",
                        bullet_list: "unordered-list-item",
                    },
                },
            },
            content: "paragraph block*",
            parseDOM: [{ tag: "li" }],
            toDOM() {
                return liDOM;
            },
            defining: true,
        },

        aside: {
            automerge: {
                block: "aside",
            },
            content: "block+",
            group: "block",
            defining: true,
            parseDOM: [{ tag: "aside" }],
            toDOM() {
                return ["aside", 0];
            },
        },
    } as MappedNodeSpec,
    marks: {
        /// An emphasis mark. Rendered as an `<em>` element. Has parse rules
        /// that also match `<i>` and `font-style: italic`.
        em: {
            parseDOM: [
                { tag: "i" },
                { tag: "em" },
                { style: "font-style=italic" },
                {
                    style: "font-style=normal",
                    clearMark: (m: Mark) => m.type.name == "em",
                },
            ],
            toDOM() {
                return ["em", 0]
            },
            automerge: {
                markName: "em",
            },
        },
    },
})
