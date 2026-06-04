# TLS and transport security checklist

## Managed by Render

- TLS termination at the edge
- Certificate issuance and renewal
- OCSP stapling and certificate-status behavior
- OpenSSL and transport-layer patching, including CVE-level fixes such as CCS injection exposure
- TLS renegotiation support and protocol/cipher configuration
- EV certificate availability and certificate-profile details

## Fixed at the application layer

- Enforce HTTPS behind the proxy using `x-forwarded-proto`
- Redirect insecure requests to HTTPS when a target URL is available
- Reject insecure requests that cannot be safely upgraded
- Send `Strict-Transport-Security` with `includeSubDomains` and `preload`
- Send `X-Content-Type-Options: nosniff`
- Send `Expect-CT` as a compatibility header where supported
- Keep `trust proxy` enabled so Express respects Render’s TLS termination

## Notes

- `OCSP Must-Staple`, `EV`, and TLS renegotiation are certificate/platform properties, not Express app settings.
- `Expect-CT` is legacy and ignored by modern browsers, but it can still be documented as part of the transport hardening posture.
- HSTS preload should only remain enabled if every subdomain is permanently HTTPS-ready.
