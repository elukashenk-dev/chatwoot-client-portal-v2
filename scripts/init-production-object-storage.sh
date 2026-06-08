#!/bin/sh
set -eu

: "${BRANDING_ASSET_STORAGE_ACCESS_KEY_ID:?set BRANDING_ASSET_STORAGE_ACCESS_KEY_ID}"
: "${BRANDING_ASSET_STORAGE_BUCKET:?set BRANDING_ASSET_STORAGE_BUCKET}"
: "${BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY:?set BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY}"
: "${PORTAL_OBJECT_STORAGE_ROOT_PASSWORD:?set PORTAL_OBJECT_STORAGE_ROOT_PASSWORD}"
: "${PORTAL_OBJECT_STORAGE_ROOT_USER:?set PORTAL_OBJECT_STORAGE_ROOT_USER}"

mc alias set portal \
  http://portal-object-storage:9000 \
  "${PORTAL_OBJECT_STORAGE_ROOT_USER}" \
  "${PORTAL_OBJECT_STORAGE_ROOT_PASSWORD}"

mc mb --ignore-existing "portal/${BRANDING_ASSET_STORAGE_BUCKET}"

if mc admin user info \
  portal \
  "${BRANDING_ASSET_STORAGE_ACCESS_KEY_ID}" >/dev/null 2>&1; then
  mc admin policy detach \
    portal \
    portal-branding-assets \
    --user "${BRANDING_ASSET_STORAGE_ACCESS_KEY_ID}" >/dev/null 2>&1 || true
  mc admin user remove \
    portal \
    "${BRANDING_ASSET_STORAGE_ACCESS_KEY_ID}"
fi

if mc admin policy info portal portal-branding-assets >/dev/null 2>&1; then
  mc admin policy remove portal portal-branding-assets
fi

cat >/tmp/portal-branding-assets-policy.json <<POLICY
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": ["arn:aws:s3:::${BRANDING_ASSET_STORAGE_BUCKET}"]
    },
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": ["arn:aws:s3:::${BRANDING_ASSET_STORAGE_BUCKET}/*"]
    }
  ]
}
POLICY

mc admin policy create \
  portal \
  portal-branding-assets \
  /tmp/portal-branding-assets-policy.json

mc admin user add \
  portal \
  "${BRANDING_ASSET_STORAGE_ACCESS_KEY_ID}" \
  "${BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY}"

mc admin policy attach \
  portal \
  portal-branding-assets \
  --user "${BRANDING_ASSET_STORAGE_ACCESS_KEY_ID}"
