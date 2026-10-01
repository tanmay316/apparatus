import { memo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Wide tables and code scroll inside their own box so a reply never pushes past the chat bubble.
const components: Components = {
  table: ({ node: _n, ...props }) => (
    <div className="chat-md-table">
      <table {...props} />
    </div>
  ),
  pre: ({ node: _n, ...props }) => <pre className="chat-md-pre" {...props} />,
  a: ({ node: _n, href, ...props }) => {
    const safe = typeof href === 'string' && /^https?:\/\//i.test(href) ? href : undefined;
    return <a {...props} href={safe} target="_blank" rel="noopener noreferrer nofollow" />;
  },
  img: () => null,
};

/** Assistant reply in markdown, styled for a narrow phone bubble. */
export const ChatMarkdown = memo(function ChatMarkdown({ text, streaming }: { text: string; streaming?: boolean }) {
  return (
    <div className={`chat-md${streaming ? ' chat-md--streaming' : ''}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
});
