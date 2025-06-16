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
import { Mark, Node } from "prosemirror-model";
import { Editor } from "./Editor";
import "./playground.css"

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

const paragraphAndHeadingSchemaAdapter = new SchemaAdapter({
    nodes: {
        doc: {
            content: "block+",
        } as MappedNodeSpec,
        text: {
            group: "inline",
        } as MappedNodeSpec,
        paragraph: {
            content: "text*",
            group: "block",
            automerge: {
                block: "paragraph",
            },
            parseDOM: [{ tag: "p" }],
            toDOM() {
                return ["p", 0]
            },
        },

        unknownBlock: {
            automerge: {
                unknownBlock: true,
            },
            group: "block",
            content: "block+",
            parseDOM: [{ tag: "div", attrs: { "data-unknown-block": "true" } }],
            toDOM() {
                return ["div", { "data-unknown-block": "true" }, 0]
            },
        },
        heading: {
            content: "text*",
            group: "block",
            attrs: {
                level: { default: 1 },
            },
            defining: true,
            parseDOM: [
                { tag: "h1", attrs: { level: 1 } },
                { tag: "h2", attrs: { level: 2 } },
                { tag: "h3", attrs: { level: 3 } },
                { tag: "h4", attrs: { level: 4 } },
                { tag: "h5", attrs: { level: 5 } },
                { tag: "h6", attrs: { level: 6 } },
            ],
            toDOM(node: any) {
                return ["h" + node.attrs.level, 0]
            },
            automerge: {
                block: "heading",
                attrParsers: {
                    fromAutomerge: (block: BlockMarker) => ({ level: block.attrs.level }),
                    fromProsemirror: (node: Node) => ({ level: node.attrs.level }),
                },
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
