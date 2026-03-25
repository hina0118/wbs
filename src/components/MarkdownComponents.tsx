/**
 * ReactMarkdown の components プロップに渡す共通コンポーネント
 * リンクをクリックすると Tauri の opener で標準ブラウザを開く
 */
import { openUrl } from "@tauri-apps/plugin-opener";

export const markdownComponents = {
  a: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    children?: React.ReactNode;
  }) => (
    <a
      {...props}
      href={href}
      onClick={(e) => {
        e.preventDefault();
        if (href) openUrl(href);
      }}
    >
      {children}
    </a>
  ),
};
