# 0001. Use authentik as the identity engine

## Status
Accepted

## Context
BlakID must provide OpenID Connect, SAML, passkeys, MFA, invitations and session revocation without inventing authentication cryptography or protocol stacks. Building a custom IdP would create unacceptable security and maintenance risk.

## Decision
authentik is the identity engine for every BlakID organisation environment. BlakID provisions, configures and observes authentik through its API, blueprints and supported flows. BlakID does not fork authentik unless a later ADR explains why a required feature cannot live outside it.

## Consequences
- Protocol correctness (OIDC, SAML, WebAuthn, JWKS, discovery) is authentik's responsibility.
- BlakID's advantage is the sovereign operating model: dedicated stacks, Australian hosting, community governance, support-access, audit aggregation and administration UX.
- Upgrades follow: upstream release → BlakID tests → staging → canary → production.
