"""
Deploys (or updates) the pain-pulse-cron Lambda + EventBridge schedule.
Idempotent — safe to re-run.

Usage:
  AWS creds + GITHUB_TOKEN must be in environment.
  ANTHROPIC_API_KEY, X_BEARER_TOKEN must be in environment.

  python deploy.py
"""

import json
import os
import sys
import time
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

REGION = os.environ.get("AWS_REGION", "us-east-1")
FUNCTION_NAME = "pain-pulse-cron"
ROLE_NAME = "pain-pulse-cron-role"
RULE_NAME = "pain-pulse-cron-wednesday"
SCHEDULE_EXPRESSION = "cron(0 13 ? * WED *)"  # Wednesday 13:00 UTC = 9am EST
GITHUB_REPO = "razbee3-prog/financial-pain-dashboard"
ZIP_PATH = Path(__file__).parent / "package.zip"


def ensure_role(iam):
    """Create the Lambda execution role with basic Lambda permissions."""
    trust = {
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": {"Service": "lambda.amazonaws.com"},
            "Action": "sts:AssumeRole",
        }],
    }
    try:
        r = iam.get_role(RoleName=ROLE_NAME)
        print(f"  Role {ROLE_NAME} already exists")
        return r["Role"]["Arn"]
    except ClientError as e:
        if e.response["Error"]["Code"] != "NoSuchEntity":
            raise

    print(f"  Creating role {ROLE_NAME}...")
    r = iam.create_role(
        RoleName=ROLE_NAME,
        AssumeRolePolicyDocument=json.dumps(trust),
        Description="Execution role for pain-pulse weekly refresh Lambda",
    )
    iam.attach_role_policy(
        RoleName=ROLE_NAME,
        PolicyArn="arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
    )
    # IAM eventual consistency — role takes a few seconds to be usable
    print("  Waiting 10s for IAM propagation...")
    time.sleep(10)
    return r["Role"]["Arn"]


def deploy_lambda(lam, role_arn: str, env_vars: dict):
    """Create or update the Lambda function."""
    with open(ZIP_PATH, "rb") as f:
        zip_bytes = f.read()

    try:
        lam.get_function(FunctionName=FUNCTION_NAME)
        print(f"  Function {FUNCTION_NAME} exists — updating code + config")
        lam.update_function_code(FunctionName=FUNCTION_NAME, ZipFile=zip_bytes)
        # Wait for code update to complete before updating config
        waiter = lam.get_waiter("function_updated")
        waiter.wait(FunctionName=FUNCTION_NAME)
        lam.update_function_configuration(
            FunctionName=FUNCTION_NAME,
            Environment={"Variables": env_vars},
            Timeout=900,
            MemorySize=512,
        )
    except ClientError as e:
        if e.response["Error"]["Code"] != "ResourceNotFoundException":
            raise
        print(f"  Creating function {FUNCTION_NAME}...")
        lam.create_function(
            FunctionName=FUNCTION_NAME,
            Runtime="python3.11",
            Role=role_arn,
            Handler="lambda_function.lambda_handler",
            Code={"ZipFile": zip_bytes},
            Timeout=900,  # 15 min max
            MemorySize=512,
            Environment={"Variables": env_vars},
            Description="Weekly Pain Pulse data refresh — fires Wednesday 9am EST",
        )

    waiter = lam.get_waiter("function_active_v2")
    waiter.wait(FunctionName=FUNCTION_NAME)
    arn = lam.get_function(FunctionName=FUNCTION_NAME)["Configuration"]["FunctionArn"]
    print(f"  Lambda ARN: {arn}")
    return arn


def ensure_schedule(events, lam, function_arn: str):
    """Create EventBridge rule + grant invoke permission."""
    print(f"  Creating EventBridge rule {RULE_NAME}...")
    events.put_rule(
        Name=RULE_NAME,
        ScheduleExpression=SCHEDULE_EXPRESSION,
        State="ENABLED",
        Description="Triggers pain-pulse weekly refresh every Wednesday 9am EST",
    )
    events.put_targets(
        Rule=RULE_NAME,
        Targets=[{"Id": "pain-pulse-target", "Arn": function_arn}],
    )

    # Grant EventBridge permission to invoke Lambda (idempotent — fail silently if exists)
    try:
        lam.add_permission(
            FunctionName=FUNCTION_NAME,
            StatementId="EventBridgeInvoke",
            Action="lambda:InvokeFunction",
            Principal="events.amazonaws.com",
            SourceArn=events.describe_rule(Name=RULE_NAME)["Arn"],
        )
        print(f"  Granted EventBridge invoke permission")
    except ClientError as e:
        if e.response["Error"]["Code"] == "ResourceConflictException":
            print(f"  Invoke permission already exists")
        else:
            raise


def main():
    required = ["ANTHROPIC_API_KEY", "X_BEARER_TOKEN", "GITHUB_TOKEN"]
    missing = [k for k in required if not os.environ.get(k)]
    if missing:
        print(f"ERROR: missing env vars: {missing}")
        sys.exit(1)

    env_vars = {
        "ANTHROPIC_API_KEY": os.environ["ANTHROPIC_API_KEY"],
        "X_BEARER_TOKEN": os.environ["X_BEARER_TOKEN"],
        "GITHUB_TOKEN": os.environ["GITHUB_TOKEN"],
        "GITHUB_REPO": GITHUB_REPO,
    }

    iam = boto3.client("iam", region_name=REGION)
    lam = boto3.client("lambda", region_name=REGION)
    events = boto3.client("events", region_name=REGION)

    print("[1/3] IAM role")
    role_arn = ensure_role(iam)

    print("[2/3] Lambda")
    function_arn = deploy_lambda(lam, role_arn, env_vars)

    print("[3/3] EventBridge schedule")
    ensure_schedule(events, lam, function_arn)

    print(f"\n✅ Done. Lambda will fire {SCHEDULE_EXPRESSION} (Wednesday 9am EST).")
    print(f"   Manual test: aws lambda invoke --function-name {FUNCTION_NAME} --region {REGION} /tmp/out.json")


if __name__ == "__main__":
    main()
