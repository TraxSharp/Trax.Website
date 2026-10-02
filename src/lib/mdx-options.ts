import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import type { Options as Schema } from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import rehypePrettyCode from "rehype-pretty-code";
import type { MDXRemoteProps } from "next-mdx-remote/rsc";
import type { Html, Paragraph, Parent, Root, Text } from "mdast";
import { visit, SKIP } from "unist-util-visit";

/**
 * Raw HTML tags a docs page may use. Today the docs use only `<a id="...">`
 * anchors; the rest are inline or disclosure tags that carry no behaviour.
 * Any other tag in the markdown renders as the literal text the author wrote,
 * so a generic like List<string> in prose reads as written.
 */
const RAW_HTML_TAGS = new Set([
  "a",
  "br",
  "details",
  "summary",
  "kbd",
  "sub",
  "sup",
]);

const TAG = /<\/?([A-Za-z][A-Za-z0-9-]*)(?:\s[^<>]*)?\/?>/g;
const COMMENT = /^\s*<!--[\s\S]*?-->\s*$/;

/** True when every `<` in the snippet opens a well-formed tag from RAW_HTML_TAGS. */
function isAllowedHtml(value: string): boolean {
  let tags = 0;
  for (const match of value.matchAll(TAG)) {
    if (!RAW_HTML_TAGS.has(match[1].toLowerCase())) return false;
    tags++;
  }
  return tags > 0 && tags === (value.match(/</g) ?? []).length;
}

const FLOW_PARENTS = new Set(["root", "blockquote", "listItem", "footnoteDefinition"]);

/**
 * Keeps the raw HTML nodes the docs are allowed to use and turns every other
 * one back into the text it came from. HTML comments are dropped. Working on
 * the parsed tree means code fences and code spans are never touched.
 */
export function remarkLiteralHtml() {
  return (tree: Root) => {
    visit(tree, "html", (node: Html, index, parent: Parent | undefined) => {
      if (!parent || index === undefined) return;
      if (COMMENT.test(node.value)) {
        parent.children.splice(index, 1);
        return [SKIP, index];
      }
      if (isAllowedHtml(node.value)) return;
      const text: Text = { type: "text", value: node.value };
      const replacement: Text | Paragraph = FLOW_PARENTS.has(parent.type)
        ? { type: "paragraph", children: [text] }
        : text;
      parent.children[index] = replacement as Parent["children"][number];
      return SKIP;
    });
  };
}

/**
 * What survives sanitizing: the elements markdown and GFM produce, plus
 * RAW_HTML_TAGS. Attributes and URL protocols follow the GitHub-style default
 * schema, so `href` accepts only http(s), mailto and relative URLs.
 *
 * `id`s are not prefixed: pages link to `#no-warranty` style anchors written
 * in the docs, and to the heading slugs rehype-slug adds after this step.
 */
export const docsSanitizeSchema: Schema = {
  ...defaultSchema,
  tagNames: [
    ...RAW_HTML_TAGS,
    "p",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "blockquote",
    "ul",
    "ol",
    "li",
    "input",
    "pre",
    "code",
    "em",
    "strong",
    "del",
    "hr",
    "img",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "section",
  ],
  clobber: [],
  clobberPrefix: "",
  strip: ["script", "style"],
};

/**
 * Options shared by every docs page. The docs are compiled as CommonMark
 * (`format: "md"`), not MDX, so a page cannot contain JSX or expressions.
 * Raw HTML is parsed by rehype-raw and then reduced to docsSanitizeSchema;
 * highlighting and heading slugs run after sanitizing, so their classes,
 * inline styles and ids are kept. A fence with no language is highlighted as
 * `text`, so every block carries a `data-language` and the `code` component
 * can tell it apart from inline code.
 */
export const docsMdxOptions: MDXRemoteProps["options"] = {
  mdxOptions: {
    format: "md",
    remarkPlugins: [remarkGfm, remarkLiteralHtml],
    rehypePlugins: [
      rehypeRaw,
      [rehypeSanitize, docsSanitizeSchema],
      rehypeSlug,
      [
        rehypePrettyCode,
        {
          theme: "github-dark-dimmed",
          keepBackground: false,
          defaultLang: { block: "text" },
        },
      ],
    ],
  },
};
