# com.google.analytics.v1 Pipeline Walkthrough

<walkthrough-author name="Robert Sahlin" repositoryUrl="" tutorialName="com.google.analytics.v1 Pipeline Walkthrough"></walkthrough-author>

## Let's get started!
This guide will show you how to setup your com.google.analytics.v1 pipeline. The walkthrough requires that you first have run the StreamProcessor walkthrough to enable API:s, bind IAM:s and create shared resource.

Steps:

1. Project and Billing
2. Custom schema
3. Modify infrastructure program

---

Click the **Next** button to move to the next step.

<walkthrough-tutorial-duration duration="10"></walkthrough-tutorial-duration>  

## 1. Project and Billing

In order to run this guide you need a valid GCP project with billing enabled (use the project where the shared infra is set up).

<walkthrough-project-billing-setup></walkthrough-project-billing-setup>

## 2. Custom schema

StreamProcessor let you to create schemas with unlimited (10 000) custom dimensions and metrics as separate fields instead of arrays.

Create an avro schema file (ex. mysite.com.avsc) by copying the template file (ua-xxxxx-y.avsc) to a filename with your propertyId.

```bash
cp ua-xxxxx-y.avsc ua-12345-1.avsc
```
Open your new avro schema file and delete or modify the example custom dimensions and metrics (hit and product level) or add more. Remember that due to BigQuery limnitations, schema evolution only supports adding fields, not deleting them.

## 3. Modify infrastructure program

<walkthrough-editor-select-line filePath="template-cloudrun/pipelines/com.google.analytics.v1/index.ts" startLine="33" startCharacterOffset="1" endLine="34" endCharacterOffset="1">Open index.ts</walkthrough-editor-select-line>



## Congratulations

<walkthrough-conclusion-trophy></walkthrough-conclusion-trophy>

You’re all set and your com.google.analytics.v1 pipeline is up and running!