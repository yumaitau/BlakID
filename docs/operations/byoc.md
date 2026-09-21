# Bring-your-own-cloud

Organisations with strict sovereignty requirements own the AWS account that runs BlakID, authentik, PostgreSQL, KMS and logs.

Yuma assumes `BlakIDYumaManagement` in that account. The role is scoped to deployment, backup and incident operations. It does not grant identity administration.

Apply `infrastructure/terraform/byoc` in the customer account (`ap-southeast-2` by default). Set hosting model `customer_aws` when provisioning the organisation.
