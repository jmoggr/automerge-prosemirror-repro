import { useState, useEffect } from "react";
import { Repo } from "@automerge/automerge-repo";
// import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb";
import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import {
    RepoContext,
    useDocument,
} from "@automerge/automerge-repo-react-hooks";

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
            <SharedCounter documentId={documentId} />
        </RepoContext.Provider>
    );
}

function SharedCounter({ documentId }: { documentId: string }) {
    const [doc, change] = useDocument<{ count?: number }>(documentId as any);

    if (!doc) return <div>Loading document…</div>;

    return (
        <div style={{ textAlign: "center", marginTop: 50 }}>
            <h1>Shared Count: {doc.count ?? 0}</h1>
            <button
                onClick={() =>
                    change((d) => {
                        d.count = (d.count ?? 0) + 1;
                    })
                }
            >
                Increment
            </button>
        </div>
    );
}
