# StreamProcessor Implementation Walkthrough

<walkthrough-author name="Robert Sahlin" repositoryUrl="" tutorialName="StreamProcessor Implementation Walkthrough"></walkthrough-author>

## Let's get started!
This guide will show you how to setup your own StreamProcessor.

Steps:

1. Project and Billing
2. Setup API:s and IAM
3. StreamProcessor alpha request form
4. Shared Infra
5. Pipelines

---

Click the **Next** button to move to the next step.

<walkthrough-tutorial-duration duration="10"></walkthrough-tutorial-duration>  

## 1. Project and Billing

In order to run this guide you need a valid GCP project with billing enabled.

<walkthrough-project-billing-setup></walkthrough-project-billing-setup>

---
[Create a project](https://cloud.google.com/resource-manager/docs/creating-managing-projects#creating_a_project)

[Enable billing for your project](https://console.cloud.google.com/billing/projects) 

[Report bug/issue](https://github.com/streamprocessor/template-cloudrun/issues)



## 2. Setup API:s and IAM

### 2.1 Background
This step runs locally and enables API:s, binds roles to service accounts, etc. Pulumi will create two resource for you:
1. streamprocessor service account: **streamprocessor@{{project-id}}.iam.gserviceaccount.com**
2. a bucket to save state for the stacks: **gs://{{project-id}}-state**

### 2.2 Pulumi
Rename the "template-cloudrun" folder (if you want to) and cd into the setup folder.
Install dependencies required (npm) and install Pulumi (a modern infrastructure as code SDK).

```bash
gcloud config set project {{project-id}}
mv ~/template-cloudrun ~/streamprocessor
cd ~/streamprocessor/setup
npm install
curl -fsSL https://get.pulumi.com | sh
export PATH=$PATH:~/.pulumi/bin
```

### 2.3 Configure Variables
Replace variables with your own preferences (project and location). Then run the pulumi program and create a new stack. You can leave passphrase empty (just hit enter three times) if you want to, the stack is only saved locally. Select yes to perform the update.

```bash
pulumi login --local
pulumi stack init {{project-id}}-setup
pulumi config set gcp:project {{project-id}}
pulumi config set gcp:region europe-west1
pulumi config set gcp:zone europe-west1-b
pulumi up
```

---

[Check api status in GCP console](https://console.cloud.google.com/apis/dashboard?project={{project-id}})

[Check IAM status in GCP console](https://console.cloud.google.com/iam-admin/iam?project={{project-id}})

[Report bug/issue](https://github.com/streamprocessor/template-cloudrun/issues)

## 3. StreamProcessor alpha request form

[Fill in the alpha access request form](https://forms.gle/A9Xu3fV5kYs1j3KC7) to get permission to use the ready made docker images (the easiest way to get started).

## 4. Set up shared infra

### 4.1. Deploy shared infra
Change directory in console to infra and run cloudbuild command

```bash
cd ../infra
gcloud builds submit --config=cloudbuild.yaml .
```
---
[Check build status in GCP console](https://console.cloud.google.com/cloud-build/builds?project={{project-id}})

[Report bug/issue](https://github.com/streamprocessor/template-cloudrun/issues)

## 5. Deploy pipelines 
Each pipeline has its own walkthrough. Change working directory to /pipelines and launch the walkthrough for the pipeline you want to deploy.

```bash
cd ../pipelines
```
### Pipeline walkthroughs
---
**com.google.analytics.v1**
```bash
cloudshell launch-tutorial com.google.analytics.v1/walkthrough.md
```

---
[Report bug/issue](https://github.com/streamprocessor/template-cloudrun/issues)

## Congratulations

<walkthrough-conclusion-trophy></walkthrough-conclusion-trophy>

You’re all set and your StreamProcessor project is up and running!

---
[Report bug/issue](https://github.com/streamprocessor/template-cloudrun/issues)