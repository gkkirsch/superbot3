---
name: gmail
description: "Send, search, read, and reply to emails via Gmail. Uses the gog CLI."
when-to-use: "When the user asks to send an email, check email, search inbox, read a message, reply to an email, or draft outreach."
allowed-tools: Bash(gog gmail *)
user-invocable: true
---

# Gmail

Send, search, read, and reply to emails using the `gog` CLI.

## Send an Email

```bash
gog gmail send \
  --to "recipient@example.com" \
  --subject "Subject line" \
  --body "Email body text" \
  --no-input --force
```

With CC/BCC:
```bash
gog gmail send \
  --to "main@example.com" \
  --cc "cc1@example.com,cc2@example.com" \
  --bcc "bcc@example.com" \
  --subject "Subject" \
  --body "Body" \
  --no-input --force
```

With attachment:
```bash
gog gmail send \
  --to "recipient@example.com" \
  --subject "See attached" \
  --body "Please find the file attached." \
  --attach /path/to/file.pdf \
  --no-input --force
```

Body from file (useful for long emails):
```bash
gog gmail send \
  --to "recipient@example.com" \
  --subject "Subject" \
  --body-file /path/to/body.txt \
  --no-input --force
```

## Search Emails

```bash
gog gmail search "from:boss@company.com subject:urgent" --json
```

Gmail search syntax:
- `from:` — sender
- `to:` — recipient
- `subject:` — subject line
- `has:attachment` — has attachments
- `after:2026/04/01` — date filter
- `is:unread` — unread only
- `in:inbox` — inbox only
- `label:` — by label

## Read a Message

```bash
# List recent messages
gog gmail messages list --json

# Read a specific message by ID
gog gmail messages get <message-id> --json
```

## Reply to an Email

```bash
gog gmail send \
  --reply-to-message-id <message-id> \
  --body "Thanks for your email. Here's my reply." \
  --no-input --force
```

Reply all:
```bash
gog gmail send \
  --reply-to-message-id <message-id> \
  --reply-all \
  --body "Reply to everyone." \
  --no-input --force
```

## List Labels

```bash
gog gmail labels list --json
```

## Important

- Always use `--no-input --force` flags to prevent interactive prompts
- Use `--json` for machine-readable output when parsing results
- For long email bodies, write to a temp file and use `--body-file`
- The `--from` flag can send from verified aliases
