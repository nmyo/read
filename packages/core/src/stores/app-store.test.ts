import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "./app-store";

describe("app-store tab initial location", () => {
  beforeEach(() => {
    useAppStore.setState({
      tabs: [{ id: "home", type: "home", title: "Home" }],
      activeTabId: "home",
      sidebarOpen: false,
      sidebarTab: "chat",
      showSettings: false,
      settingsTab: "general",
    });
  });

  it("updates and clears reader initialCfi on an existing tab", () => {
    const { addTab } = useAppStore.getState();

    addTab({
      id: "reader-book-1",
      type: "reader",
      title: "Book 1",
      bookId: "book-1",
      initialCfi: "epubcfi(/6/2)",
    });
    addTab({
      id: "reader-book-1",
      type: "reader",
      title: "Book 1",
      bookId: "book-1",
      initialCfi: "page:3",
    });

    expect(useAppStore.getState().tabs.find((tab) => tab.id === "reader-book-1")?.initialCfi).toBe(
      "page:3",
    );

    addTab({
      id: "reader-book-1",
      type: "reader",
      title: "Book 1",
      bookId: "book-1",
      initialCfi: undefined,
    });

    expect(
      useAppStore.getState().tabs.find((tab) => tab.id === "reader-book-1")?.initialCfi,
    ).toBeUndefined();
  });
});
