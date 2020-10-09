import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";

const config = new pulumi.Config();
const gcpConfig = new pulumi.Config("gcp");
const projectId = gcpConfig.require("project");

/*
* Create a GCP Storage Bucket and export the DNS name
*/
const stateBucket = new gcp.storage.Bucket(projectId + "-state");
export const stateBucketName = stateBucket.url;


/*
* Enable API:s
*/
const secretManagerApi = new gcp.projects.Service("secretManagerApi", {
    service: "secretmanager.googleapis.com",
});

const cloudBuildApi = new gcp.projects.Service("cloudBuildApi", {
    service: "cloudbuild.googleapis.com",
});

const cloudRunApi = new gcp.projects.Service("cloudRunApi", {
    service: "run.googleapis.com",
});

const cloudKmsApi = new gcp.projects.Service("cloudKmsApi", {
    service: "cloudkms.googleapis.com",
});

const firestoreApi = new gcp.projects.Service("firestoreApi", {
    service: "firestore.googleapis.com",
});


/*
* Bind roles to cloud bild service account
*/
const cloudBuildIamMember = gcp.organizations
    .getProject({projectId: projectId})
    .then(projectResult => {return "serviceAccount:"+ projectResult.number + "@cloudbuild.gserviceaccount.com"});

const cloudBuildIamBindingEditor = new gcp.projects.IAMBinding("cloudBuildIamBindingEditor", {
    members: [cloudBuildIamMember],
    role: "roles/editor",
    project: projectId});

const cloudBuildIamBindingDataflowAdmin = new gcp.projects.IAMBinding("cloudBuildIamBindingDataflowAdmin", {
    members: [cloudBuildIamMember],
    role: "roles/dataflow.admin",
    project: projectId});

const cloudBuildIamBindingCloudFunctionsDeveloper = new gcp.projects.IAMBinding("cloudBuildIamBindingCloudFunctionsDeveloper", {
    members: [cloudBuildIamMember],
    role: "roles/cloudfunctions.developer",
    project: projectId});

const cloudBuildIamBindingRunAdmin = new gcp.projects.IAMBinding("cloudBuildIamBindingRunAdmin", {
    members: [cloudBuildIamMember],
    role: "roles/run.admin",
    project: projectId});

const cloudBuildIamBindingIamServiceAccountUser = new gcp.projects.IAMBinding("cloudBuildIamBindingIamServiceAccountUser", {
    members: [cloudBuildIamMember],
    role: "roles/iam.serviceAccountUser",
    project: projectId});

const cloudBuildIamBindingCloudkmsCryptoKeyEncrypterDecrypter = new gcp.projects.IAMBinding("cloudBuildIamBindingCloudkmsCryptoKeyEncrypterDecrypter", {
    members: [cloudBuildIamMember],
    role: "roles/cloudkms.cryptoKeyEncrypterDecrypter",
    project: projectId});

const cloudBuildIamBindingSecretmanagerSecretAccessor = new gcp.projects.IAMBinding("cloudBuildIamBindingSecretmanagerSecretAccessor", {
    members: [cloudBuildIamMember],
    role: "roles/secretmanager.secretAccessor",
    project: projectId});


/*
* Cloud Build Agent
*/
const cloudBuildAgentIamMember = gcp.organizations
    .getProject({projectId: projectId})
    .then(projectResult => {return "serviceAccount:service-"+ projectResult.number + "@gcp-sa-cloudbuild.iam.gserviceaccount.com"});

const cloudBuildAgentIamBindingCloudkmsCryptoKeyEncrypterDecrypter = new gcp.projects.IAMBinding("cloudBuildAgentIamBindingCloudkmsCryptoKeyEncrypterDecrypter", {
    members: [cloudBuildAgentIamMember],
    role: "roles/cloudkms.cryptoKeyEncrypterDecrypter",
    project: projectId});


/*
* Create a service account, store credentials as a secret and give it needed priviliges
*/
const streamProcessorServiceAccount = new gcp.serviceaccount.Account("streamProcessorServiceAccount",{
    accountId: "streamprocessor",
    description:"The service account used by StreamProcessor services",
    displayName:"StreamProcessor service account"});
export const streamProcessorServiceAccountEmail = streamProcessorServiceAccount.email;

const streamProcessorServiceAccountKey = new gcp.serviceaccount.Key("streamProcessorServiceAccountKey", {
    serviceAccountId: streamProcessorServiceAccountEmail
});

const streamProcessorServiceAccountSecret = new gcp.secretmanager.Secret("streamProcessorServiceAccountSecret", {
    secretId: "pulumi-credentials",
    replication: {
        userManaged: {
            replicas:[
                {location: "us-central1"}
            ]
        }
    }
}, {dependsOn:[secretManagerApi]});

const streamProcessorServiceAccountSecretVersion = new gcp.secretmanager.SecretVersion("streamProcessorServiceAccountSecretVersion", {
    secret: streamProcessorServiceAccountSecret.name,
    secretData: streamProcessorServiceAccountKey.privateKey.apply(privateKey => Buffer.from(privateKey, 'base64').toString('ascii')),
}, {dependsOn:[secretManagerApi, streamProcessorServiceAccountSecret]});

const streamProcessorIamBindingCloudfunctionsAdmin = new gcp.projects.IAMBinding("streamProcessorIamBindingCloudfunctionsAdmin", {
    members: [pulumi.interpolate`serviceAccount:${streamProcessorServiceAccountEmail}`],
    role: "roles/cloudfunctions.admin",
    project: projectId});

const streamProcessorIamBindingRunAdmin = new gcp.projects.IAMBinding("streamProcessorIamBindingRunAdmin", {
    members: [pulumi.interpolate`serviceAccount:${streamProcessorServiceAccountEmail}`],
    role: "roles/run.admin",
    project: projectId});

const streamProcessorIamBindingPubsubEditor = new gcp.projects.IAMBinding("streamProcessorIamBindingPubsubEditor", {
    members: [pulumi.interpolate`serviceAccount:${streamProcessorServiceAccountEmail}`],
    role: "roles/pubsub.editor",
    project: projectId});

const streamProcessorIamBindingIamServiceAccountUser = new gcp.projects.IAMBinding("streamProcessorIamBindingIamServiceAccountUser", {
    members: [pulumi.interpolate`serviceAccount:${streamProcessorServiceAccountEmail}`],
    role: "roles/iam.serviceAccountUser",
    project: projectId});

const streamProcessorIamBindingStorageObjectAdmin = new gcp.projects.IAMBinding("streamProcessorIamBindingStorageObjectAdmin", {
    members: [pulumi.interpolate`serviceAccount:${streamProcessorServiceAccountEmail}`],
    role: "roles/storage.objectAdmin",
    project: projectId});

const streamProcessorIamBindingBigqueryDataEditor = new gcp.projects.IAMBinding("streamProcessorIamBindingBigqueryDataEditor", {
    members: [pulumi.interpolate`serviceAccount:${streamProcessorServiceAccountEmail}`],
    role: "roles/bigquery.dataEditor",
    project: projectId});


/*
* bind iam.serviceaccountuser on project level to cloud build and streamprocessor service accounts
*/
const projectIamBindingIamServiceAccountUser = new gcp.projects.IAMBinding("projectIamBindingIamServiceAccountUser", {
    members: [
        pulumi.interpolate`serviceAccount:${streamProcessorServiceAccountEmail}`,
        cloudBuildIamMember
    ],
    role: "roles/iam.serviceAccountUser",
    project: projectId});


/*
* pubsub service agent iam bindings
*/
const pubsubServiceAgentIamMember = gcp.organizations
    .getProject({projectId: projectId})
    .then(projectResult => {return "serviceAccount:service-"+ projectResult.number + "@gcp-sa-pubsub.iam.gserviceaccount.com"});

const pubsubServiceAgentIamBindingIamServiceAccountUser = new gcp.projects.IAMBinding("pubsubServiceAgentIamBindingIamServiceAccountUser", {
    members: [pubsubServiceAgentIamMember],
    role: "roles/iam.serviceAccountTokenCreator",
    project: projectId});

// kms encryption
const streamProcessorKmsKeyRing = new gcp.kms.KeyRing("streamProcessorKmsKeyRing", {
    name: "streamprocessor",
    location: "global",
    project: projectId
}, {dependsOn:[cloudKmsApi]});

const streamProcessorKmsCryptoKey = new gcp.kms.CryptoKey("streamProcessorKmsCryptoKey", {
    name: "pulumi",
    keyRing: streamProcessorKmsKeyRing.id,
}, {dependsOn:[streamProcessorKmsKeyRing]});