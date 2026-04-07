# space.json Schema

```json
{
  "$schema": "superbot3-space-v1",
  "name": "hostreply",
  "slug": "hostreply",
  "codeDir": "/Users/gkkirsch/dev/airbnb-ai",
  "spaceDir": "/Users/gkkirsch/superbot3/spaces/hostreply",
  "claudeConfigDir": "/Users/gkkirsch/superbot3/spaces/hostreply/.claude",
  "active": true,
  "created": "2026-04-01T10:00:00Z",
  "sessionId": null
}
```

## Fields
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `$schema` | string | yes | Always `"superbot3-space-v1"` |
| `name` | string | yes | Human-readable name |
| `slug` | string | yes | URL-safe identifier, used for dirs/teams |
| `codeDir` | string | no | External code repository path. If set, Claude launches with this as cwd. |
| `spaceDir` | string | yes | Absolute path to space directory |
| `claudeConfigDir` | string | yes | Absolute path to space's `.claude/` |
| `active` | boolean | yes | Whether the space should be started |
| `created` | string | yes | ISO timestamp of creation |
| `sessionId` | string | no | Claude session ID for `--resume`. Set after first launch. |

## Discovery
Spaces are discovered by scanning `~/.superbot3/spaces/*/space.json`. Directory existence = space exists. No registry file needed.
