# com.google.analytics.v1 Pipeline Walkthrough

<walkthrough-author name="Robert Sahlin" repositoryUrl="" tutorialName="com.google.analytics.v1 Pipeline Walkthrough"></walkthrough-author>

## Let's get started!
This guide will show you how to setup your com.google.analytics.v1 pipeline. The walkthrough requires that you first have run the StreamProcessor walkthrough to enable API:s, bind IAM:s and create shared resource.

Steps:

1. Project and Billing
2. Custom schema

---

Click the **Next** button to move to the next step.

<walkthrough-tutorial-duration duration="10"></walkthrough-tutorial-duration>  

## 1. Project and Billing

In order to run this guide you need a valid GCP project with billing enabled (use the project where the shared infra is set up).

<walkthrough-project-billing-setup></walkthrough-project-billing-setup>

## 2. Custom schema

com.google.analytics.v1 enable you to create schemas with unlimited (10 000) custom dimensions and metrics as separate fields instead of arrays. Also, you can set permissions on column level using data catalog policy tags. Create an avro schema file (ex. mysite.com.avsc) by copying the template file (com.google.analytics.v1)

```bash
cp com.google.analytics.v1.avsc mysite.com.avsc
```
open your new avro schema file and delete or modify the example custom dimension and metric or add more. Remember that schema evolution only supports adding fields, not deleting them (limitation in BigQuery).

## 3. Modify infrastructure code




## Congratulations

<walkthrough-conclusion-trophy></walkthrough-conclusion-trophy>

You’re all set and your com.google.analytics.v1 pipeline is up and running!