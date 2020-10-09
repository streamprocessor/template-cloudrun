import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";

const infra = new pulumi.StackReference(`infra`);
//const serviceAccountName = infra.getOutput("streamProcessorServiceAccountEmail");

const config = new pulumi.Config();
const serviceAccountName = config.require("serviceAccountName");

const gcpConfig = new pulumi.Config("gcp");
const region = gcpConfig.require("region");
const zone = gcpConfig.require("zone");
const project = gcpConfig.require("project");

const artifactRegistryHostname = `${region}-docker.pkg.dev`;

function getServiceResponse(
    url = '',
    targetAudience = null
  ) {
    const {GoogleAuth} = require('google-auth-library');
    const auth = new GoogleAuth();
  
    async function request() {
      if (!targetAudience) {
        // Use the request URL hostname as the target audience for requests.
        const {URL} = require('url');
        targetAudience = new URL(url).origin;
      }
      console.info(`request ${url} with target audience ${targetAudience}`);
      const client = await auth.getIdTokenClient(targetAudience);
      const res = await client.request({url});
      //console.log(JSON.stringify(res.data, null, 4));
      return JSON.stringify(res.data);
    }
  
    return request().catch(err => {
      console.error(err.message);
    });
}

/*
******** START com.google.analytics.v1 ********
*/
const comGoogleAnalyticsV1EntityTransformerVersion = "latest";
const comGoogleAnalyticsV1EntityTransformerService = new gcp.cloudrun.Service("transformer-com-google-analytics-v1-entity", {
    location: `${region}`,
    template: {
        spec: {
            serviceAccountName: serviceAccountName,
            containers: [{
                envs: [
                    {
                        name: "TOPIC",
                        value: transformedTopic.name,
                    }
                ],
                image: `${artifactRegistryHostname}/streamprocessor-org/transformer/com-google-analytics-v1:${comGoogleAnalyticsV1EntityTransformerVersion}`,
            }],
        },
        metadata: {
            annotations: {
                "autoscaling.knative.dev/maxScale": "10"
            },
            labels: {
                stream: "com-google-analytics-v1",
                component: "transformer",
            },
        }
    },
    traffics: [{
        latestRevision: true,
        percent: 100,
    }],
}, { dependsOn: [enableCloudRun, transformedTopic] });

const comGoogleAnalyticsV1EntityCollectedSubscription = new gcp.pubsub.Subscription("com-google-analytics-v1-entity-transformer", {
    topic: collectedTopic.name,
    ackDeadlineSeconds: 20,
    filter: "hasPrefix(attributes.subject, \"com.google.analytics.v1\")",
    labels: {
        stream: "com-google-analytics-v1",
        component: "transformer",
    },
    pushConfig: {
        pushEndpoint: comGoogleAnalyticsV1EntityTransformerService.status.url,
        attributes: {
            "x-goog-version": "v1",
        },
        oidcToken: {
            serviceAccountEmail: serviceAccountName
        }
    },
    deadLetterPolicy: {
        deadLetterTopic: deadLetterTopic.id
    }
}, { dependsOn: [comGoogleAnalyticsV1EntityTransformerService, deadLetterTopic] });

const comGoogleAnalyticsV1EntityDataset = new gcp.bigquery.Dataset("dataset-com-google-analytics-v1-entity", {
    datasetId: "com_google_analytics_v1",
    friendlyName: "com.google.analytics.v1",
    description: "This is a test description",
    location: "EU",
    labels: {
        stream: "com-google-analytics-v1",
        component: "loader",
    },
});  

const robertSahlinComSchema = registryService.status.url.apply(s => {
    return pulumi.output(getServiceResponse(s+'/subjects/com.google.analytics.v1.transformed.robertsahlin_com.Entity/versions/latest/bigqueryschema' , null));
});

const robertsahlinComTable = new gcp.bigquery.Table("table-robertsahlin-com", {
    datasetId: comGoogleAnalyticsV1EntityDataset.datasetId,
    tableId: "robertsahlin_com",
    timePartitioning: {
        type: "DAY",
        field: "timestamp"
    },
    labels: {
        stream: "com-google-analytics-v1",
        component: "loader",
    },
    schema: robertSahlinComSchema
}, { dependsOn: registryService });

const robertSahlinComSerializedSubscriptionEndpoint = pulumi.all([loaderService.status.url, robertsahlinComTable]).apply(([url, table]) => {
    return pulumi.output(pulumi.interpolate`${url}/project/${project}/dataset/${table.datasetId}/table/${table.tableId}`);
});

const robertSahlinComSerializedSubscription = new gcp.pubsub.Subscription("robertsahlin-com-entity-loader", {
    topic: serializedTopic.name,
    ackDeadlineSeconds: 20,
    filter: "attributes.subject=\"com.google.analytics.v1.transformed.robertsahlin_com.Entity\"",
    labels: {
        stream: "all",
        component: "loader",
    },
    pushConfig: {
        pushEndpoint: robertSahlinComSerializedSubscriptionEndpoint,
        attributes: {
            "x-goog-version": "v1",
        },
        oidcToken: {
            serviceAccountEmail: serviceAccountName
        }
    },
    deadLetterPolicy: {
        deadLetterTopic: deadLetterTopic.id
    }
}, { dependsOn: [loaderService, serializedTopic, deadLetterTopic, robertsahlinComTable] });

const comGoogleAnalyticsV1EntityTransformerInvoker = new gcp.cloudrun.IamMember("invoker-com-google-analytics-v1-entity-transformer", {
    location: comGoogleAnalyticsV1EntityTransformerService.location,
    project: comGoogleAnalyticsV1EntityTransformerService.project,
    service: comGoogleAnalyticsV1EntityTransformerService.name,
    role: "roles/run.invoker",
    member: `serviceAccount:${serviceAccountName}`,
});

/*
******** END com.google.analytics.v1 ********
*/