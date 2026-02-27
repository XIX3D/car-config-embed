# JWT Structure

The widget uses JWT (JSON Web Token) to securely pass product configuration.

## Payload Structure

```typescript
interface JWTPayload {
  wheel_id?: string    // Wheel product ID
  wrap_id?: string     // Wrap product ID
  variant_ids?: string[] // Allowed variant IDs
  exp?: number         // Expiration (Unix seconds)
  iat?: number         // Issued at (Unix seconds)
}
```

## Fields

### wheel_id / wrap_id

One of these is required. The product identifier from your platform.

```json
{
  "wheel_id": "wheel-sport-001"
}
```

Or for wraps:

```json
{
  "wrap_id": "wrap-matte-black"
}
```

### variant_ids

Optional. Array of allowed variant IDs. If specified, only these variants will be shown to the user.

```json
{
  "wheel_id": "wheel-sport-001",
  "variant_ids": ["var-gloss-black", "var-chrome", "var-bronze"]
}
```

If omitted, all variants for the product are available.

### exp

Optional but recommended. Expiration timestamp in Unix seconds.

```json
{
  "wheel_id": "wheel-sport-001",
  "exp": 1735689600
}
```

The widget checks this and rejects expired tokens.

### iat

Optional. Issued-at timestamp in Unix seconds.

```json
{
  "wheel_id": "wheel-sport-001",
  "iat": 1704153600
}
```

## Example Tokens

### Wheel with specific variants

```json
{
  "wheel_id": "wheel-sport-001",
  "variant_ids": ["var-001", "var-002", "var-003"],
  "exp": 1767225600,
  "iat": 1704153600
}
```

### Wrap with all variants

```json
{
  "wrap_id": "wrap-matte-001",
  "exp": 1767225600,
  "iat": 1704153600
}
```

## Generating Tokens

### Node.js

```javascript
import jwt from 'jsonwebtoken'

const token = jwt.sign(
  {
    wheel_id: 'wheel-sport-001',
    variant_ids: ['var-001', 'var-002'],
    exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 days
  },
  process.env.JWT_SECRET
)
```

### Python

```python
import jwt
import time

token = jwt.encode(
    {
        'wheel_id': 'wheel-sport-001',
        'variant_ids': ['var-001', 'var-002'],
        'exp': int(time.time()) + (30 * 24 * 60 * 60)
    },
    os.environ['JWT_SECRET'],
    algorithm='HS256'
)
```

### PHP

```php
use Firebase\JWT\JWT;

$token = JWT::encode([
    'wheel_id' => 'wheel-sport-001',
    'variant_ids' => ['var-001', 'var-002'],
    'exp' => time() + (30 * 24 * 60 * 60)
], $_ENV['JWT_SECRET'], 'HS256');
```

## Token Decoder

Use the [Playground](/playground) to decode and inspect tokens.

## Security Considerations

1. **Server-side generation** - Generate tokens on your server, never expose the secret to the client
2. **Short expiration** - Use reasonable expiration times (hours to days, not years)
3. **Validate on use** - The widget validates `exp` but your server should also verify tokens
4. **Limit variants** - Use `variant_ids` to control which options users can access

## Validation

The widget performs these checks:

1. Valid JWT format (3 parts, base64url encoded)
2. Valid JSON in header and payload
3. `exp` not in the past (if present)
4. Either `wheel_id` or `wrap_id` present

Invalid tokens result in a console error and no action.
