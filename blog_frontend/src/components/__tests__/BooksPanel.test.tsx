import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import {BooksPanel} from "../BooksPanel/BooksPanel";
import type {BooksSuggestionData} from "../../lib/types";

const mockBooksData: BooksSuggestionData = {
  query: "Books on: Distributed Systems",
  topic: "Distributed Systems",
  amazon_domain: "amazon.in",
  fetchedAt: "2026-10-08T12:00:00Z",
  scoredBy: "heuristic",
  books: [
    {
      title: "Designing Data-Intensive Applications",
      authors: ["Martin Kleppmann"],
      price: "₹1,499",
      rating: 4.8,
      reviews_count: 5200,
      link: "https://amazon.in/dp/B001",
      thumbnail: "https://images.amazon.com/book1.jpg",
      asin: "B001",
    },
    {
      title: "Distributed Systems: Principles and Paradigms",
      authors: ["Andrew S. Tanenbaum", "Maarten van Steen"],
      price: "₹850",
      rating: 4.6,
      reviews_count: 850,
      link: "https://amazon.in/dp/B002",
      thumbnail: "https://images.amazon.com/book2.jpg",
      asin: "B002",
    },
    {
      title: "Database Internals: A Deep Dive",
      authors: ["Alex Petrov"],
      price: "₹1,200",
      rating: 4.7,
      reviews_count: 1100,
      link: "https://amazon.in/dp/B003",
      thumbnail: "https://images.amazon.com/book3.jpg",
      asin: "B003",
    },
  ],
};

describe("BooksPanel component (Hermetic)", () => {
  it("renders unfetched state when booksData is null", () => {
    const handleFetch = vi.fn();
    render(<BooksPanel booksData={null} onFetch={handleFetch} loading={false} />);

    expect(screen.getByText(/Books Suggestion/i)).toBeTruthy();
    expect(screen.getByText(/Unfetched/i)).toBeTruthy();
    expect(screen.getByText(/No book suggestions compiled yet/i)).toBeTruthy();

    const fetchBtns = screen.getAllByRole("button", {name: /Find Book Suggestions/i});
    expect(fetchBtns.length).toBeGreaterThan(0);
    fireEvent.click(fetchBtns[0]);
    expect(handleFetch).toHaveBeenCalledTimes(1);
  });

  it("renders loaded books cards with thumbnail, titles, prices and Amazon links", () => {
    render(<BooksPanel booksData={mockBooksData} loading={false} />);

    expect(screen.getByText(/Active/i)).toBeTruthy();
    expect(screen.getByText(/Ranked by heuristic/i)).toBeTruthy();

    // Check all 3 book titles rendered
    expect(screen.getByText("Designing Data-Intensive Applications")).toBeTruthy();
    expect(screen.getByText("Distributed Systems: Principles and Paradigms")).toBeTruthy();
    expect(screen.getByText("Database Internals: A Deep Dive")).toBeTruthy();

    // Check author bylines
    expect(screen.getByText(/by Martin Kleppmann/i)).toBeTruthy();

    // Check prices
    expect(screen.getByText("₹1,499")).toBeTruthy();
    expect(screen.getByText("₹850")).toBeTruthy();

    // Check Amazon link attributes
    const amazonLinks = screen.getAllByRole("link", {name: /View on Amazon\.in/i});
    expect(amazonLinks).toHaveLength(3);
    expect(amazonLinks[0].getAttribute("href")).toBe("https://amazon.in/dp/B001");
    expect(amazonLinks[0].getAttribute("target")).toBe("_blank");
    expect(amazonLinks[0].getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("renders loading state", () => {
    render(<BooksPanel booksData={null} loading={true} />);
    expect(screen.getByText(/Scanning Amazon & scoring publications/i)).toBeTruthy();
  });

  it("renders error banner when error is present", () => {
    render(<BooksPanel booksData={null} error="Failed to fetch Amazon books." />);
    expect(screen.getByText("Failed to fetch Amazon books.")).toBeTruthy();
  });
});
