# Customer-owned AWS account. Yuma manages through a narrowly scoped cross-account role.
# Default region remains ap-southeast-2.

variable "yuma_account_id" {
  type        = string
  description = "Yuma AWS account that may assume the management role"
}

variable "organisation_slug" {
  type = string
}

data "aws_iam_policy_document" "trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${var.yuma_account_id}:root"]
    }
    condition {
      test     = "StringEquals"
      variable = "sts:ExternalId"
      values   = [var.organisation_slug]
    }
  }
}

resource "aws_iam_role" "yuma_management" {
  name               = "BlakIDYumaManagement"
  assume_role_policy = data.aws_iam_policy_document.trust.json
}

resource "aws_iam_role_policy" "scoped" {
  name = "blakid-scoped-ops"
  role = aws_iam_role.yuma_management.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecs:Describe*",
          "ecs:UpdateService",
          "rds:Describe*",
          "rds:CreateDBSnapshot",
          "kms:DescribeKey",
          "kms:CreateGrant",
          "logs:DescribeLogGroups"
        ]
        Resource = "*"
      }
    ]
  })
}

output "yuma_role_arn" {
  value = aws_iam_role.yuma_management.arn
}
