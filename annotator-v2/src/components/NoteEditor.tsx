import { useEffect, useRef } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListNode, ListItemNode } from '@lexical/list';
import type { EditorState, LexicalEditor } from 'lexical';

interface Props {
  initialState?: string;
  initialText: string;
  onChange: (state: string, text: string) => void;
  autoFocus?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
}

const theme = {
  paragraph: 'note-p',
  text: {
    bold: 'note-bold',
    italic: 'note-italic',
    underline: 'note-underline',
  },
  list: {
    nested: { listitem: 'note-nested-li' },
    ul: 'note-ul',
    ol: 'note-ol',
    listitem: 'note-li',
  },
};

export default function NoteEditor({
  initialState, initialText, onChange, autoFocus, onFocus, onBlur,
}: Props) {
  const editorRef = useRef<LexicalEditor | null>(null);

  const config = {
    namespace: 'annotator-note',
    theme,
    nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode],
    editorState: initialState || undefined,
    onError: (err: Error) => { console.warn('[note-editor]', err); },
  };

  return (
    <LexicalComposer initialConfig={config}>
      <EditorBridge editorRef={editorRef} fallbackText={initialState ? '' : initialText} autoFocus={autoFocus} />
      <div className="relative h-full" onFocus={onFocus} onBlur={onBlur}>
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              className="w-full h-full bg-transparent outline-none text-slate-800 text-sm leading-relaxed"
              style={{ minHeight: '100%' }}
            />
          }
          placeholder={<div className="absolute top-0 left-0 text-slate-800/50 text-sm pointer-events-none">Type a note…</div>}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />
        <ListPlugin />
        <OnChangePlugin onChange={(state: EditorState, editor: LexicalEditor) => {
          editorRef.current = editor;
          const json = JSON.stringify(state.toJSON());
          let text = '';
          state.read(() => { text = state._nodeMap.size > 0 ? (editor.getRootElement()?.innerText ?? '') : ''; });
          onChange(json, text);
        }} />
      </div>
    </LexicalComposer>
  );
}

/** Seed the editor with plain text on first mount when no lexical state exists. */
function EditorBridge({
  editorRef, fallbackText, autoFocus,
}: {
  editorRef: React.MutableRefObject<LexicalEditor | null>;
  fallbackText: string;
  autoFocus?: boolean;
}) {
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (autoFocus) editor.focus();
    if (fallbackText) {
      editor.update(() => {
        const root = editor.getRootElement();
        if (root && !root.textContent) {
          root.textContent = fallbackText;
        }
      });
    }
  }, [editorRef, fallbackText, autoFocus]);
  return null;
}
