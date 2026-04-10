---
name: browser-scraper
description: "Higher-level web scraping patterns — multi-page extraction, pagination, structured data output. Built on the browser skill."
when-to-use: "When the user needs to scrape data from websites, extract structured information from multiple pages, crawl with pagination, or collect data into JSON/CSV."
allowed-tools: Bash(agent-browser *), Bash(agent-browser:*), Read, Write, Edit
user-invocable: true
---

# Browser Scraper

Higher-level scraping patterns built on agent-browser. For basic browser interaction, use the `/browser` skill.

## Single Page Extraction

```bash
# 1. Open the page
agent-browser open https://example.com/products

# 2. Wait for content
agent-browser wait --load networkidle

# 3. Extract with JavaScript
agent-browser eval "JSON.stringify([...document.querySelectorAll('.product')].map(el => ({
  name: el.querySelector('.name')?.textContent?.trim(),
  price: el.querySelector('.price')?.textContent?.trim(),
  url: el.querySelector('a')?.href
})))"
```

Save the JSON output to a file for processing.

## Multi-Page Scraping (Pagination)

```bash
# Pattern: scrape current page, click next, repeat

# 1. Open first page
agent-browser open https://example.com/listings?page=1

# 2. For each page:
#    a. Wait for content
agent-browser wait --load networkidle

#    b. Extract data
agent-browser eval "JSON.stringify([...document.querySelectorAll('.item')].map(el => ({
  title: el.querySelector('h2')?.textContent?.trim(),
  link: el.querySelector('a')?.href
})))"

#    c. Check for next page
agent-browser snapshot -i -s ".pagination"

#    d. Click next (if exists)
agent-browser click @e5  # the "Next" button ref

#    e. Repeat from step 2
```

Write a bash loop or let the LLM iterate manually based on snapshot output.

## URL-Based Pagination

When pages use URL patterns (easier than clicking):

```bash
# Iterate through pages by URL
for page in 1 2 3 4 5; do
  agent-browser open "https://example.com/results?page=$page"
  agent-browser wait --load networkidle
  agent-browser get text body >> all_results.txt
done
```

## Scraping Behind Login

```bash
# 1. Login first (or use saved auth)
agent-browser auth login mysite

# 2. Navigate to protected content
agent-browser open https://app.example.com/dashboard/data

# 3. Extract
agent-browser wait --load networkidle
agent-browser eval "document.querySelector('table').outerHTML" > table.html
```

## Screenshot Evidence

Always capture screenshots as evidence of what you scraped:

```bash
agent-browser screenshot --full evidence/page-1.png
agent-browser screenshot --annotate evidence/page-1-annotated.png
```

## Rate Limiting

Be respectful when scraping:

```bash
# Add delays between page loads
agent-browser open https://example.com/page/1
sleep 2
agent-browser open https://example.com/page/2
sleep 2
```

For automated scraping loops, use 2-5 second delays between requests.

## Output Formats

### JSON
```bash
# Extract and save as JSON
agent-browser eval "JSON.stringify(data, null, 2)" > output.json
```

### CSV
```bash
# Extract as CSV via JavaScript
agent-browser eval "
  const rows = [...document.querySelectorAll('tr')];
  const csv = rows.map(r => [...r.querySelectorAll('td,th')].map(c => c.textContent.trim()).join(',')).join('\n');
  csv
" > output.csv
```

### Text
```bash
agent-browser get text body > output.txt
```

## Best Practices

1. **Always snapshot before interacting** — refs change after DOM updates
2. **Wait for network idle** after navigation before extracting
3. **Use `eval` for structured extraction** — more reliable than `get text`
4. **Save screenshots** as evidence of what was scraped
5. **Rate limit** — 2-5 second delays between pages
6. **Handle errors** — pages may not load, elements may not exist
7. **Use `--download-path`** for file downloads so they go to a known location
