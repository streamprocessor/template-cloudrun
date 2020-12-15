# com.google.analytics.v1 Pipeline Walkthrough

<walkthrough-author name="Robert Sahlin" repositoryUrl="" tutorialName="com.google.analytics.v1 Pipeline Walkthrough"></walkthrough-author>

## Let's get started!
This guide will show you how to setup your com.google.analytics.v1 pipeline. The walkthrough requires that you first have run the StreamProcessor walkthrough to enable API:s, bind IAM:s and create shared resource.

Steps:

1. Project and Billing
2. Custom schema
3. Modify infrastructure program
4. Add tracking script in Google Tag Manager

---

Click the **Next** button to move to the next step.

<walkthrough-tutorial-duration duration="10"></walkthrough-tutorial-duration>  

## 1. Project and Billing

In order to run this guide you need a valid GCP project with billing enabled (use the project where the shared infra is set up).

<walkthrough-project-billing-setup></walkthrough-project-billing-setup>

## 2. Custom schema

StreamProcessor let you to create schemas with unlimited (10 000) custom dimensions and metrics as separate fields instead of arrays.

Create an avro schema file by copying the template file (ua-xxxxx-y.avsc_) to an avro schema file (.avsc) with your propertyId as filename (ex. ua-12345-1.avsc).

```bash
cp ./com.google.analytics.v1/schemas/ua-xxxxx-y.avsc_ ./com.google.analytics.v1/schemas/ua-12345-1.avsc
```
Open your new avro schema file (<walkthrough-cloud-shell-editor-icon></walkthrough-cloud-shell-editor-icon>) and delete or modify the example custom dimensions and metrics (exist on hit and product level) or add more. Remember that due to BigQuery limnitations, schema evolution only supports adding fields, not deleting them. 
- *Alias* referes to the parameter containing the custom dimension/metric.
- *Name* is what you will see in BigQuery. 
- *doc* lets you set a field description
- *type* you can set other data types than string if that better represent your custom dimension/metric.

```json
{
    "name" : "CustomDimensions",
    "namespace": "com.google.analytics.v1", 
    "type" : "record",
    "isRegistryStream" : "false", 
    "fields" : [
      {
        "name" : "color",
        "aliases" : ["cd1"], 
        "type": ["null", "string"],
        "default" : null,
        "doc" : "the user's favourite color"
      }
    ]
  }
```

You also need to change the property reference in the namespace of the Entity record (in the end of the file).

```json
{
    "name": "Entity",
    "namespace": "com.google.analytics.v1.transformed.ua-xxxxx-y",
    "type": "record",
    "fields": [...
```
---
[Report bug/issue](https://github.com/streamprocessor/template-cloudrun/issues)

## 3. Modify infrastructure program

Open the index.ts file (<walkthrough-cloud-shell-editor-icon></walkthrough-cloud-shell-editor-icon>) and mody the settings.

```javascript
const comGoogleAnalyticsV1EntityTransformerVersion = "0.1.2"; // Choose the latest version available
const bigQueryLocation = "EU";
let properties = ["ua-xxxxx-y"]; //Array of comma separated property id:s
```

Then build your pipeline by executing

```bash
gcloud builds submit --config=cloudbuild.yaml ./com.google.analytics.v1 --substitutions=_STACK=com-google-analytics-v1
```

---
[Report bug/issue](https://github.com/streamprocessor/template-cloudrun/issues)

## 4. Add tracking script in Google Tag Manager
Google Tag Manager (GTM) lets you add a Google Analytics (GA) custom task to copy the GA payload and send to StreamProcessor collector endpoint.
1. Create a custom javascript variable in GTM, paste the code from client.js and name it "customTask"
2. Create a constant variable in GTM named collectorEndpoint and set the value to the domain of your collector (something like https://europe-west1-my-project-id.cloudfunctions.net/collector)
3. Set a field in the GA Settings variable (in GTM) with field name "customTask" and value { {customTask} }
4. Create version and publish it in GTM

---
[Report bug/issue](https://github.com/streamprocessor/template-cloudrun/issues)

## Congratulations

<walkthrough-conclusion-trophy></walkthrough-conclusion-trophy>

You’re all set and your com.google.analytics.v1 pipeline is up and running!

---
[Report bug/issue](https://github.com/streamprocessor/template-cloudrun/issues)