# Media Module (`/v0`) — API Contract

Reusable tenant-scoped image upload contract for menu, inventory, tenant logo, profile images, and payment-proof evidence.

Base path: `/v0/media`

## Conventions

- Auth: `Authorization: Bearer <accessToken>`
- Context: tenant is taken from token (`tenantId` in body/query is ignored)
- Multipart field name: `image`
- Allowed mime types: `image/jpeg`, `image/jpg`, `image/png`, `image/webp`
- Max size: `5MB`
- Upload lifecycle:
  - uploaded images are recorded as `PENDING`
  - when a feature entity references the `imageUrl` (for example menu item create/update), backend marks it `LINKED`
  - stale `PENDING` uploads are cleaned up by background dispatcher

## Endpoint

### Upload image

`POST /v0/media/images/upload`

Action key: `media.images.upload`

Headers:
- `Content-Type: multipart/form-data`

Body (form-data):
- `image` (file) — required
- `area` (text) — required, one of:
  - `menu`
  - `inventory`
  - `tenant`
  - `profile`
  - `payment-proof`

Response `200`:
```json
{
  "success": true,
  "data": {
    "imageUrl": "https://cdn-or-proxy-url",
    "key": "<area-prefix>/<tenantId>/<generated-filename>.jpg",
    "filename": "<generated-filename>.jpg",
    "mimeType": "image/jpeg",
    "sizeBytes": 123456,
    "area": "menu"
  }
}
```

Area prefix mapping:
- `menu` -> `menu-item-images`
- `inventory` -> `stock-item-images`
- `tenant` -> `tenant-logo`
- `profile` -> `profile-images`
- `payment-proof` -> `payment-proof-images`

Errors:
- `400` `UPLOAD_FILE_TOO_LARGE`
- `400` `UPLOAD_INVALID_FIELD`
- `400` `UPLOAD_BAD_REQUEST`
- `422` `UPLOAD_FILE_REQUIRED`
- `422` `UPLOAD_INVALID_AREA`
- `422` `UPLOAD_INVALID_TYPE`
- `403` `TENANT_CONTEXT_REQUIRED`
- `503` `IMAGE_STORAGE_NOT_CONFIGURED`
- `503` `IMAGE_UPLOAD_FAILED`
