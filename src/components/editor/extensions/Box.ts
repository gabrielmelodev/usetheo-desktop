import { Node, mergeAttributes } from "@tiptap/core";

export const Box = Node.create({
  name: "box",

  group: "block",

  content: "block+",

  parseHTML() {
    return [
      {
        tag: "div[data-box]",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-box": "",
        class: "bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-lg my-4",
      }),
      0,
    ];
  },

  addCommands() {
    return {
      toggleBox:
        () =>
        ({ commands }: { commands: any }) => {
          return commands.toggleWrap(this.name);
        },
    } as any;
  },
});
