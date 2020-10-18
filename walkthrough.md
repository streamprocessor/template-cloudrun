# StreamProcessor Implementation Walkthrough

<walkthrough-author name="Robert Sahlin" repositoryUrl="" tutorialName="StreamProcessor Implementation Walkthrough"></walkthrough-author>

## Let's get started!
This guide will show you how to setup your own StreamProcessor.

Steps:

1. Project and Billing
2. StreamProcessor alpha request form
3. Setup
4. Infra
5. Pipelines

---

Click the **Next** button to move to the next step.

<walkthrough-tutorial-duration duration="10"></walkthrough-tutorial-duration>  

## 1. Project and Billing

In order to run this guide you need a valid GCP project with billing enabled.

<walkthrough-project-billing-setup></walkthrough-project-billing-setup>

---
[Create a project](https://cloud.google.com/resource-manager/docs/creating-managing-projects#creating_a_project)

[Enable billing for your project](https://cloud.google.com/billing/docs/how-to/modify-project#enable_billing_for_a_project) 


## 2. StreamProcessor alpha request form

[Fill in the alpha access request form](https://forms.gle/A9Xu3fV5kYs1j3KC7) to get permission to use the ready made docker images (the easiest way to get started).


## 3. Setup

### Background
This step runs locally and enables API:s, binds roles to service accounts, etc. and creates two resources:
1. streamprocessor service account
2. a bucket to save state for the stacks created in the infra and pipelines steps

### Pulumi
Rename the "template-cloudrun" folder (if you want to) and cd into the setup folder.
Install dependencies required (npm) and install Pulumi (a modern infrastructure as code SDK).

```bash
cd setup
npm install
curl -fsSL https://get.pulumi.com | sh
```
### Configure Variables
Replace variables with your own preferences (project and location). Then run the pulumi program and create a new stack. You can leave passphrase empty if you want to. The stack is only saved locally. Store the bucket name and service account email as environment variables.

```bash
pulumi config set gcp:project {{project-id}}
pulumi config set gcp:region europe-west1
pulumi config set gcp:zone europe-west1-b
pulumi up
export stateBucketName="gs://{{project-id}}-state"
export streamProcessorServiceAccountEmail="streamprocessor@{{project-id}}.iam.gserviceaccount.com"
```

---

[Check api status in GCP console](https://console.cloud.google.com/apis/dashboard?project={{project-id}})

[Check IAM status in GCP console](https://console.cloud.google.com/iam-admin/iam?project={{project-id}})

## 3. Set up storage
### 3.1. BigQuery datasets and Storage bucket
Set up BigQuery datasets (streams and backup) and storage bucket for DataFlow jobs by running the command below. Notice that the setup stores data in EU.
```bash
gcloud deployment-manager deployments create setup-storage --config infrastructure/measurementprotocol/v2/setup-processor-resources-eu.yaml
```

### 3.2. Dataflow storage folders
Create required folders in cloud storage for dataflow to work properly.
```bash
infrastructure/measurementprotocol/v2/setup-storage
```
---
[Check deployment status in GCP console](https://console.cloud.google.com/dm/deployments?project={{project-id}})

## 4. Set up streams
DataHem uses pubsub for asynchronous messaging between services. 

Repeat the steps below for each property you want to track.

### 4.1. Set property id
Lowercase your Google Analytics property id (UA-XXXXXX-X) and remove the dash sign and assign as PROPERTY_ID 
Example, for UA-123456-7 assign ua1234567 as PROPERTY_ID

Set PROPERTY_ID variable.
```bash
PROPERTY_ID=ua1234567
```

### 4.2. Create pubsub
Then run below to create pubsub streams for that property.
```bash
gcloud deployment-manager deployments create property-$PROPERTY_ID --template infrastructure/measurementprotocol/v2/add-property.py --properties property:$PROPERTY_ID --async
```

---

[Check deployment status in GCP console](https://console.cloud.google.com/dm/deployments?project={{project-id}})

[Check pubsub status in GCP console](https://console.cloud.google.com/cloudpubsub/topicList?project={{project-id}})

## 5. Set up the Collector
The DataHem measurement protocol pipeline use AppEngine as the hit collector.

### 5.1. Initialize App Engine
Run gcloud command to initialize AppEngine. Be careful when selecting the AppEngine region (europe-west) since you can't change it later.
```bash
gcloud app create
```

### 5.2. Deploy collector
Build and deploy the collector app.
```bash
gcloud builds submit --config collector/appengine/cloudbuild.yaml --no-source --async
```
---
[AppEngine dashboard](https://console.cloud.google.com/appengine)

[Check build status in GCP console](https://console.cloud.google.com/cloud-build/builds?project={{project-id}})

## 6.1 Processor configuration
The DataHem measurement protocol pipeline use DataFlow for processing.

Modify and set the CONFIG variable to reflect your setup. [Detailed documenation about configuration options.](https://github.com/datahem/builder/blob/master/tutorials/measurementprotocol/v2/configuration.md)

```shell
CONFIG=' 
{
    "name":"accountName", 
    "properties":[{ 
        "id":"ua1234567", 
        "views":[{ 
            "id":"master", 
            "searchEnginesPattern":".*(www\\.google\\.|www\\.bing\\.|search\\.yahoo\\.).*", 
            "ignoredReferersPattern":".*(datahem\\.org|klarna\\.com).*", 
            "socialNetworksPattern":".*(facebook\\.|instagram\\.|pinterest\\.|youtube\\.|linkedin\\.|twitter\\.).*", 
            "includedHostnamesPattern":".*(datahem\\.org).*", 
            "excludedBotsPattern":".*(^$|bot|spider|crawler).*", 
            "siteSearchPattern":".*q=(([^&#]*)|&|#|$)", 
            "timeZone":"Europe/Stockholm", 
            "excludedIpsPattern":"(127\\.0\\.0\\.0|172\\.16\\.0\\.0)", 
            "pubSubTopic":"ua1234567-master", 
            "tableSpec":"streams.ua1234567_master"
        }, { 
            "id":"unfiltered", 
            "searchEnginesPattern":".*(www\\.google\\.|www\\.bing\\.|search\\.yahoo\\.).*", 
            "ignoredReferersPattern":".*(\\.datahem\\.org).*", 
            "socialNetworksPattern":".*(facebook\\.|instagram\\.|pinterest\\.|youtube\\.|linkedin\\.|twitter\\.).*", 
            "includedHostnamesPattern":".*", 
            "excludedBotsPattern":"\\b\\B", 
            "siteSearchPattern":".*q=(([^&#]*)|&|#|$)", 
            "timeZone":"Europe/Stockholm", 
            "excludedIpsPattern":"\\b\\B", 
            "tableSpec":"streams.ua1234567_unfiltered"
        }]
    }]
}'
```

## 6.2 Processor deployment
Build and deploy the processor with the command below. 

```bash
gcloud builds submit --config processor/measurementprotocol/v2/cloudbuild.yaml --no-source --async --substitutions=^~^_CONFIG="$CONFIG"
```
---

### Build parameters
The build accepts parameters separated by "~", i.e. *--substitutions=^~^_JOB_NAME=mp2~_CONFIG="$CONFIG"

*_TAG*

*_JOB_NAME*

*_ZONE*

*_REGION*

*_NUM_WORKERS*

*_MAX_NUM_WORKERS*

*_DISK_SIZE_GB*

*_WORKER_MACHINE_TYPE*

*_CONFIG*

The **_CONFIG** parameter is required (set to the CONFIG variable set in the previous step). 

[Default parameter values.](https://github.com/datahem/builder/blob/master/processor/measurementprotocol/v2/cloudbuild.yaml)

---

[Check build status in GCP console](https://console.cloud.google.com/cloud-build/builds?project={{project-id}})

## 7. Set up Tracker

### 7.1. Create customTask variable
Create a [Google Tag Manager](https://tagmanager.google.com) custom javascript variable named **datahem customTask** by copying code from one of:

[Beacon tracker - modern transport option](https://github.com/mhlabs/datahem.tracker/blob/2c8ec795b6b3c8f7590aeeffb34cc1114d3e3208/src/main/js/org/datahem/measurement_protocol/variables/BeaconTracker.js#L21)

[Pixel tracker - standard transport option](https://github.com/mhlabs/datahem.tracker/blob/2c8ec795b6b3c8f7590aeeffb34cc1114d3e3208/src/main/js/org/datahem/measurement_protocol/variables/PixelTracker.js#L22)

Modify the script by setting the endpoints variable to match your project:

*var endpoints = 'https://project-id.appspot.com/';*

---

### 7.2. Add the customTask to the GA Settings variable
In your Google Analytics Settings variable: 
- add a field named **customTask** 
- and set the value to **{{datahem customTask}}**


## 8. Test and monitor the setup

### 8.1 Test beacon endpoint
Test the sendBeacon tracking collector endpoint by running command below, you should receive a HTTP response status 204.
```bash
curl \
    -H "Content-Type: application/json" \
    -X POST \
    -d '{"payload": "echo"}' \
    "https://$PROJECT_ID.appspot.com/_ah/api/collect/v1/open/ua123456789/" -i
```

### 8.2. Test pixel endpoint
Test the pixel tracking collector endpoint by running command below, you should receive a GIF with a HTTP response status 200.
```bash
curl \
    -H "Content-Type: gif" \
    -X GET \
    "https://$PROJECT_ID.appspot.com/gif/?cstream=ua123456789&v=1" -i
```

### 8.3 Monitor services
You can monitor your services by visiting:

[AppEngine dashboard](https://console.cloud.google.com/appengine)

[Dataflow dashboard](https://console.cloud.google.com/dataflow)

[BigQuery](https://console.cloud.google.com/bigquery)


## Congratulations

<walkthrough-conclusion-trophy></walkthrough-conclusion-trophy>

You’re all set!

You can now analyze your measurement protocol data in BigQuery!


