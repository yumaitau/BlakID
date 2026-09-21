# 0004. Australian-hosted default

## Status
Accepted

## Context
BlakID is identity infrastructure for Indigenous organisations. Data residency is part of the product, not an option buried in a settings page.

## Decision
Default production region is AWS `ap-southeast-2` (Australia — Sydney). Deployment location is visible in the organisation console: region, dedicated stack, dedicated PostgreSQL, encryption, backup region. Customer-owned AWS, Azure, private cloud and on-premises are supported as explicit hosting models, not silent fallbacks.

## Consequences
- Terraform and operational docs assume ap-southeast-2.
- Backups stay in the selected sovereignty region unless the customer explicitly configures otherwise.
