# 0008. OIDC is the primary integration protocol

## Status
Accepted

## Context
Applications need a modern, interoperable login path. SAML remains necessary. LDAP is legacy. A custom protocol would lock customers in.

## Decision
OpenID Connect (authorization code + PKCE, refresh tokens, client credentials, discovery, JWKS, scopes, custom claims) is the primary integration. SAML 2.0 is supported for applications that require it. LDAP/LDAPS is available and labelled legacy. Device code is used where authentik supports it.

## Consequences
- The application wizard leads with OIDC and returns Client ID, Client Secret, Issuer URL, Discovery URL, redirect and logout configuration.
- Catalogue templates prefer OIDC then SAML then LDAP.
