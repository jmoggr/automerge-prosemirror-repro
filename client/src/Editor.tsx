// from: https://github.com/automerge/automerge-prosemirror/blob/main/playground/src/Editor.tsx

import React, { useState, useRef, useLayoutEffect } from "react"
import { Command, EditorState, NodeSelection, Transaction } from "prosemirror-state"
import { keymap } from "prosemirror-keymap"
import {
    baseKeymap,
    chainCommands,
    deleteSelection,
    joinBackward,
    selectNodeBackward,
    setBlockType,
    toggleMark,
    wrapIn,
} from "prosemirror-commands"
import { buildKeymap } from "prosemirror-example-setup"
import { history, undo, redo } from "prosemirror-history"
import { MarkType, NodeType, Schema } from "prosemirror-model"
import { EditorView } from "prosemirror-view"
import {
    inputRules,
    wrappingInputRule,
    textblockTypeInputRule,
    smartQuotes,
    ellipsis,
    emDash,
} from "prosemirror-inputrules"
import "prosemirror-view/style/prosemirror.css"
import { Prop } from "@automerge/automerge"
import { DocHandle } from "@automerge/automerge-repo"
import {
    wrapInList,
    splitListItem,
    sinkListItem,
    liftListItem,
} from "prosemirror-schema-list"
import { useHandleReady } from "./useHandleReady.js"
import {
    Bold,
    Braces,
    Italic,
    Link,
    List,
    ListOrdered,
    Heading1,
    Heading2,
    Heading3,
    Heading4,
    Heading5,
    Heading6,
    TextQuote,
    Indent,
    Outdent,
    Image,
} from "lucide-react"
import LinkForm from "./LinkForm.js"
import Modal from "./Modal.js"
import { SchemaAdapter, init } from "@automerge/prosemirror"

import {
    makeBlockMathInputRule,
    makeInlineMathInputRule,
    mathBackspaceCmd,
    mathPlugin,
    REGEX_BLOCK_MATH_DOLLARS,
    REGEX_INLINE_MATH_DOLLARS
} from "@benrbray/prosemirror-math";


export type EditorProps = {
    name?: string
    handle: DocHandle<unknown>
    path: Prop[]
    schemaAdapter: SchemaAdapter
}

const toggleBold = (schema: Schema) => toggleMarkCommand(schema.marks.strong)
const toggleItalic = (schema: Schema) => toggleMarkCommand(schema.marks.em)

function toggleMarkCommand(mark: MarkType): Command {
    return (
        state: EditorState,
        dispatch: ((tr: Transaction) => void) | undefined,
    ) => {
        return toggleMark(mark)(state, dispatch)
    }
}

// Copied from: https://github.com/benrbray/prosemirror-math/blob/master/lib/commands/insert-math-cmd.ts
export function insertMathInlineCmd(mathNodeType: NodeType, initialText = ""): Command {
    return (state: EditorState, dispatch: ((tr: Transaction) => void) | undefined) => {
        const { $from } = state.selection;
        const index = $from.index();
        if (!$from.parent.canReplaceWith(index, index, mathNodeType)) {
            return false;
        }

        if (dispatch) {
            const mathNode = mathNodeType.create(
                {},
                initialText ? state.schema.text(initialText) : null,
            );

            let tr = state.tr.replaceSelectionWith(mathNode);
            tr = tr.setSelection(NodeSelection.create(tr.doc, $from.pos));

            dispatch(tr);
        }

        return true;
    };
}

export function insertMathDisplayCmd(nodeType: NodeType, initialText = ""): Command {
    return (state: EditorState, dispatch: ((tr: Transaction) => void) | undefined) => {
        const { $from, $to } = state.selection;

        if (!dispatch) {
            return true;
        }

        // There is an idiomatic pattern at the start of commands inserting new nodes to check that the node can
        // be inserted with canReplaceWith. In this case we skip the check because canReplaceWith will
        // always (I think) fail when trying to put a block inside a paragraph.

        const selectedText = state.doc.textBetween($from.pos, $to.pos, " ");
        const initialTextContent = initialText || selectedText;
        const initialContent = initialTextContent ? state.schema.text(initialTextContent) : null;

        const mathNode = nodeType.create({}, initialContent);

        let tr = state.tr;

        // delete the selected text (it will be replaced with `initalContent`)
        if ($from.pos !== $to.pos) {
            tr = tr.delete($from.pos, $to.pos);
        }

        // if we're inside a paragraph, split the paragraph
        if ($from.parent.type.name === "paragraph" && $from.parent.content.size !== 0) {
            tr = tr.split($from.pos);
        }

        tr = tr.insert($from.pos, mathNode);
        tr = tr.setSelection(NodeSelection.create(tr.doc, $from.pos + 1));

        dispatch(tr);

        return true;
    };
}

export function Editor({ handle, path, schemaAdapter }: EditorProps) {
    const editorRoot = useRef<HTMLDivElement>(null)
    const [view, setView] = useState<EditorView | null>(null)
    const handleReady = useHandleReady(handle)
    const [linkModalOpen, setLinkModalOpen] = useState(false)
    const [{ boldActive, emActive }, setMarkState] = useState({
        boldActive: false,
        emActive: false,
    })

    useLayoutEffect(() => {
        if (!handleReady) {
            return
        }

        const {
            schema,
            pmDoc,
            plugin: syncPlugin,
        } = init(handle, path, { schemaAdapter })

        let inlineMathInputRule = makeInlineMathInputRule(REGEX_INLINE_MATH_DOLLARS, schema.nodes.math_inline);
        let blockMathInputRule = makeBlockMathInputRule(REGEX_BLOCK_MATH_DOLLARS, schema.nodes.math_display);

        const state = EditorState.create({
            schema,
            plugins: [
                mathPlugin,
                buildInputRules(schema),
                history(),
                keymap({ "Mod-z": undo, "Mod-y": redo, "Shift-Mod-z": redo }),
                keymap({
                    "Mod-m": insertMathInlineCmd(schema.nodes.math_inline),
                    "Mod-b": insertMathDisplayCmd(schema.nodes.math_display, ""),
                    // "Mod-b": toggleBold(schema),
                    "Mod-i": toggleItalic(schema),
                    "Mod-l": toggleMark(schema.marks.link, {
                        href: "https://example.com",
                        title: "example",
                    }),
                    Enter: splitListItem(schema.nodes.list_item),
                    "Backspace": chainCommands(deleteSelection, mathBackspaceCmd, joinBackward, selectNodeBackward),
                }),
                keymap(buildKeymap(schema)),
                keymap(baseKeymap),
                inputRules({ rules: [inlineMathInputRule, blockMathInputRule] }),
                syncPlugin,
            ],
            doc: pmDoc,
        })

        const editorView = new EditorView(editorRoot.current, {
            state,
            dispatchTransaction(this: EditorView, tr: Transaction) {
                const newState = this.state.apply(tr)
                this.updateState(newState)
                setMarkState(activeMarks(newState, schema))
            },
        })

        setView(editorView)
        return () => {
            editorView.destroy()
        }
    }, [handleReady])

    let onBoldClicked = null
    if (view && view.state.schema.marks.strong) {
        onBoldClicked = () => {
            if (view) {
                toggleBold(view.state.schema)(view.state, view.dispatch, view)
            }
        }
    }

    let onItalicClicked = null
    if (view && view.state.schema.marks.em) {
        onItalicClicked = () => {
            if (view) {
                toggleItalic(view.state.schema)(view.state, view.dispatch, view)
            }
        }
    }

    let onIncreaseIndent = null
    if (view && view.state.schema.nodes.list_item) {
        onIncreaseIndent = () => {
            if (view) {
                // If we're in a list, figure out what kind it is
                const { $from } = view.state.selection
                let listNode = null
                for (let i = $from.depth; i > 0; i--) {
                    if ($from.node(i).type.name === "list_item") {
                        listNode = $from.node(i - 1)
                        break
                    }
                }
                const listType = listNode
                    ? listNode.type
                    : view.state.schema.nodes.bullet_list
                if (listNode) {
                    chainCommands(
                        sinkListItem(view.state.schema.nodes.list_item),
                        wrapInList(listType),
                    )(view.state, view.dispatch, view)
                }
            }
        }
    }

    let onDecreaseIndent = null
    if (view && view.state.schema.nodes.list_item) {
        onDecreaseIndent = () => {
            if (view) {
                liftListItem(view.state.schema.nodes.list_item)(
                    view.state,
                    view.dispatch,
                    view,
                )
            }
        }
    }

    let onBlockQuoteClicked = null
    if (view && view.state.schema.nodes.blockquote) {
        onBlockQuoteClicked = () => {
            if (view) {
                turnSelectionIntoBlockquote(view.state, view.dispatch, view)
            }
        }
    }

    let onToggleOrderedList = null
    if (view && view.state.schema.nodes.bullet_list) {
        onToggleOrderedList = () => {
            if (view) {
                wrapInList(view.state.schema.nodes.bullet_list)(
                    view.state,
                    view.dispatch,
                    view,
                )
            }
        }
    }

    let onToggleNumberedList = null
    if (view && view.state.schema.nodes.ordered_list) {
        onToggleNumberedList = () => {
            if (view) {
                wrapInList(view.state.schema.nodes.ordered_list)(
                    view.state,
                    view.dispatch,
                    view,
                )
            }
        }
    }

    let onHeadingClicked = null
    if (view && view.state.schema.nodes.heading) {
        onHeadingClicked = (level: number) => {
            if (view) {
                const { $from } = view.state.selection
                if (
                    $from.node().type.name === "heading" &&
                    $from.node().attrs.level === level
                ) {
                    setBlockType(view.state.schema.nodes.paragraph)(
                        view.state,
                        view.dispatch,
                        view,
                    )
                } else {
                    setBlockType(view.state.schema.nodes.heading, { level })(
                        view.state,
                        view.dispatch,
                        view,
                    )
                }
            }
        }
    }

    let showLinkDialog = null
    if (view && view.state.schema.marks.link) {
        showLinkDialog = () => {
            setLinkModalOpen(true)
        }
    }

    const onLinkChosen = (url: string) => {
        if (view) {
            const { from, to } = view.state.selection
            const tr = view.state.tr
            tr.addMark(
                from,
                to,
                view.state.schema.marks.link.create({ href: url, title: "" }),
            )
            view.dispatch(tr)
        }
    }

    let onCodeClicked = null
    if (view && view.state.schema.nodes.code_block) {
        onCodeClicked = () => {
            if (view) {
                setBlockType(view.state.schema.nodes.code_block)(
                    view.state,
                    view.dispatch,
                    view,
                )
            }
        }
    }

    if (!handleReady) {
        return <div>Loading...</div>
    }

    return (
        <div id="prosemirror">
            <MenuBar
                onBoldClicked={onBoldClicked}
                onItalicClicked={onItalicClicked}
                onLinkClicked={showLinkDialog}
                onBlockQuoteClicked={onBlockQuoteClicked}
                onToggleOrderedList={onToggleOrderedList}
                onToggleNumberedList={onToggleNumberedList}
                onIncreaseIndent={onIncreaseIndent}
                onDecreaseIndent={onDecreaseIndent}
                onHeadingClicked={onHeadingClicked}
                onImageClicked={null}
                onCodeClicked={onCodeClicked}
                isBoldActive={boldActive}
                isEmActive={emActive}
            />
            <div id="editor" ref={editorRoot} />
            <Modal
                isOpen={linkModalOpen}
                onClose={() => {
                    setLinkModalOpen(false)
                }}
            >
                <LinkForm
                    onUrlChosen={url => {
                        setLinkModalOpen(false)
                        onLinkChosen(url)
                    }}
                />
            </Modal>
        </div>
    )
}

type MenuBarProps = {
    onBoldClicked: (() => void) | null
    onItalicClicked: (() => void) | null
    onLinkClicked: (() => void) | null
    onBlockQuoteClicked: (() => void) | null
    onToggleOrderedList: (() => void) | null
    onToggleNumberedList: (() => void) | null
    onIncreaseIndent: (() => void) | null
    onDecreaseIndent: (() => void) | null
    onHeadingClicked: ((level: number) => void) | null
    onImageClicked: (() => void) | null
    onCodeClicked: (() => void) | null
    isBoldActive: boolean
    isEmActive: boolean
}

function MenuBar({
    onBoldClicked,
    onItalicClicked,
    onLinkClicked,
    onBlockQuoteClicked,
    onToggleOrderedList,
    onToggleNumberedList,
    onIncreaseIndent,
    onDecreaseIndent,
    onHeadingClicked,
    onImageClicked,
    onCodeClicked,
    isBoldActive,
    isEmActive,
}: MenuBarProps) {
    return (
        <div id="menubar" className="menubar">
            <div className="row">
                {onBoldClicked ? (
                    <button
                        id="bold"
                        onClick={onBoldClicked}
                        className={isBoldActive ? "active" : ""}
                    >
                        <Bold />
                    </button>
                ) : null}
                {onItalicClicked ? (
                    <button
                        id="italic"
                        onClick={onItalicClicked}
                        className={isEmActive ? "active" : ""}
                    >
                        <Italic />
                    </button>
                ) : null}
                {onLinkClicked ? (
                    <button id="link" onClick={onLinkClicked}>
                        <Link />
                    </button>
                ) : null}
                {onCodeClicked ? (
                    <button onClick={onCodeClicked}>
                        <Braces />
                    </button>
                ) : null}
            </div>
            {onHeadingClicked ? (
                <div className="row">
                    <button onClick={() => onHeadingClicked(1)}>
                        <Heading1 />
                    </button>
                    <button onClick={() => onHeadingClicked(2)}>
                        <Heading2 />
                    </button>
                    <button onClick={() => onHeadingClicked(3)}>
                        <Heading3 />
                    </button>
                    <button onClick={() => onHeadingClicked(4)}>
                        <Heading4 />
                    </button>
                    <button onClick={() => onHeadingClicked(5)}>
                        <Heading5 />
                    </button>
                    <button onClick={() => onHeadingClicked(6)}>
                        <Heading6 />
                    </button>
                </div>
            ) : null}
            <div className="row">
                {onBlockQuoteClicked ? (
                    <CaptionedButton caption="Blockquote" onClick={onBlockQuoteClicked}>
                        <TextQuote />
                    </CaptionedButton>
                ) : null}
                {onToggleNumberedList ? (
                    <CaptionedButton caption="number list" onClick={onToggleNumberedList}>
                        <ListOrdered />
                    </CaptionedButton>
                ) : null}
                {onToggleOrderedList ? (
                    <CaptionedButton caption="bullet list" onClick={onToggleOrderedList}>
                        <List />
                    </CaptionedButton>
                ) : null}
                {onIncreaseIndent ? (
                    <CaptionedButton caption="indent" onClick={onIncreaseIndent}>
                        <Indent />
                    </CaptionedButton>
                ) : null}
                {onDecreaseIndent ? (
                    <CaptionedButton caption="outdent" onClick={onDecreaseIndent}>
                        <Outdent />
                    </CaptionedButton>
                ) : null}
                {onImageClicked ? (
                    <CaptionedButton caption="image" onClick={onImageClicked}>
                        <Image />
                    </CaptionedButton>
                ) : null}
            </div>
        </div>
    )
}

function CaptionedButton({
    caption,
    onClick,
    children,
}: {
    caption: string
    onClick: () => void
    children: React.ReactNode
}) {
    return (
        <div className="captionedButton">
            <button onClick={onClick}>{children}</button>
            <p>{caption}</p>
        </div>
    )
}

function markActive(state: EditorState, type: MarkType) {
    const { from, $from, to, empty } = state.selection
    if (empty) return !!type.isInSet(state.storedMarks || $from.marks())
    else return state.doc.rangeHasMark(from, to, type)
}

function activeMarks(
    state: EditorState,
    schema: Schema,
): { boldActive: boolean; emActive: boolean } {
    let boldActive = false
    let emActive = false
    if (schema.marks.strong) {
        boldActive = markActive(state, schema.marks.strong)
    }
    if (schema.marks.em) {
        emActive = markActive(state, schema.marks.em)
    }
    return { boldActive, emActive }
}

function blockQuoteRule(nodeType: NodeType) {
    return wrappingInputRule(/^\s*>\s$/, nodeType)
}

function orderedListRule(nodeType: NodeType) {
    return wrappingInputRule(
        /^(\d+)\.\s$/,
        nodeType,
        match => ({ order: +match[1] }),
        (match, node) => node.childCount + node.attrs.order == +match[1],
    )
}

function bulletListRule(nodeType: NodeType) {
    return wrappingInputRule(/^\s*([-+*])\s$/, nodeType)
}

function codeBlockRule(nodeType: NodeType) {
    return textblockTypeInputRule(/^```$/, nodeType)
}

function headingRule(nodeType: NodeType, maxLevel: number) {
    return textblockTypeInputRule(
        new RegExp("^(#{1," + maxLevel + "})\\s$"),
        nodeType,
        match => ({ level: match[1].length }),
    )
}

function buildInputRules(schema: Schema) {
    const rules = smartQuotes.concat(ellipsis, emDash)
    let type
    if ((type = schema.nodes.blockquote)) rules.push(blockQuoteRule(type))
    if ((type = schema.nodes.ordered_list)) rules.push(orderedListRule(type))
    if ((type = schema.nodes.bullet_list)) rules.push(bulletListRule(type))
    if ((type = schema.nodes.code_block)) rules.push(codeBlockRule(type))
    if ((type = schema.nodes.heading)) rules.push(headingRule(type, 6))
    return inputRules({ rules })
}
