import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";

//const infra = new pulumi.StackReference(`setup-dev`);
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
******** START SETTINGS ********
*/

const collectorVersion = "0.0.1";
const serializerVersion = "latest";
const registratorVersion = "latest";
const loaderVersion = "latest";

/*
******** END SETTINGS ********
*/


/*
******** START BOOTSTRAP ********
*/

// Enable APIs
const enableCloudResourceManager = new gcp.projects.Service("enable-cloud-resource-manager", {
    service: "cloudresourcemanager.googleapis.com",
});

const enableCloudFunctions = new gcp.projects.Service("enable-cloud-functions", {
    service: "cloudfunctions.googleapis.com",
});

const enableCloudRun = new gcp.projects.Service("enable-cloud-run", {
    service: "run.googleapis.com",
});

// Create GCP PubSub topics
const deadLetterTopic = new gcp.pubsub.Topic("dead-letter", {
    labels: {
        stream: "all",
        component: "dead-letter",
    },
    messageStoragePolicy: {
        allowedPersistenceRegions: [gcpConfig.require("region")]
    }
});

const collectedTopic = new gcp.pubsub.Topic("collected", {
    labels: {
        stream: "all",
        component: "collector",
    },
    messageStoragePolicy: {
        allowedPersistenceRegions: [gcpConfig.require("region")]
    }
});

const transformedTopic = new gcp.pubsub.Topic("transformed", {
    labels: {
        stream: "all",
        component: "transformer",
    },
    messageStoragePolicy: {
        allowedPersistenceRegions: [gcpConfig.require("region")]
    }
});

const serializedTopic = new gcp.pubsub.Topic("serialized", {
    labels: {
        stream: "all",
        component: "serializer",
    },
    messageStoragePolicy: {
        allowedPersistenceRegions: [gcpConfig.require("region")]
    }
});

const encryptedTopic = new gcp.pubsub.Topic("encrypted", {
    labels: {
        stream: "all",
        component: "encryptor",
    },
    messageStoragePolicy: {
        allowedPersistenceRegions: [gcpConfig.require("region")]
    }
});

const processedTopic = new gcp.pubsub.Topic("processed", {
    labels: {
        stream: "all",
        component: "processed",
    },
    messageStoragePolicy: {
        allowedPersistenceRegions: [gcpConfig.require("region")]
    }
});

// Deploy collector on cloud functions and make public
const collectorFunction = new gcp.cloudfunctions.Function("collector", {
    name: 'collector',
    description: "Collect messages over http POST",
    runtime: "nodejs10",
    availableMemoryMb: 256,
    sourceArchiveBucket: "streamprocessor-org",
    sourceArchiveObject: `functions/collector/collector-${collectorVersion}.zip`,
    triggerHttp: true,
    entryPoint: "collector",
    maxInstances: 5,
    region: `${region}`,
    serviceAccountEmail: serviceAccountName,
    environmentVariables: {
        ALLOW_ORIGINS: "https://robertsahlin.com",
        API_KEYS: "123",
        TOPIC: collectedTopic.name
    },
    labels: {
        stream: "all",
        component: "collector",
    },
}, { dependsOn: [enableCloudFunctions, collectedTopic] });

const publicFunctionInvoker = new gcp.cloudfunctions.FunctionIamMember("collector-iam-public-invoker", {
    project: collectorFunction.project,
    region: collectorFunction.region,
    cloudFunction: collectorFunction.name,
    role: "roles/cloudfunctions.invoker",
    member: "allUsers",
}, { dependsOn: collectorFunction });

// Deploy registrator on cloud run. Modify max instances if needed (default 10).
const registryService = new gcp.cloudrun.Service("registrator", {
    location: `${region}`,
    template: {
        spec: {
            serviceAccountName: serviceAccountName,
            containers: [{
                envs: [
                    {
                        name: "COMPATIBILITY",
                        value: "FORWARD",
                    },
                ],
                image: `${artifactRegistryHostname}/streamprocessor-org/registrator/cloud-run-java:${registratorVersion}`,
            }],
        },
        metadata: {
            annotations: {
                "autoscaling.knative.dev/maxScale": "10"
            },
            labels: {
                stream: "all",
                component: "registrator",
            },
        }
    },
    traffics: [{
        latestRevision: true,
        percent: 100,
    }],
}, { dependsOn: [enableCloudRun] });

// Deploy serializer on cloud run. Modify max instances if needed (default 10).
const serializerService = new gcp.cloudrun.Service("serializer", {
    location: `${region}`,
    template: {
        spec: {
            serviceAccountName: serviceAccountName,
            containers: [{
                envs: [
                    {
                        name: "TOPIC",
                        value: serializedTopic.name,
                    },
                    {
                        name: "REGISTRATOR_HOST",
                        value: registryService.status.url,
                    },
                ],
                image: `${artifactRegistryHostname}/streamprocessor-org/serializer/cloud-run-java:${serializerVersion}`,
            }],
        },
        metadata: {
            annotations: {
                "autoscaling.knative.dev/maxScale": "10"
            },
            labels: {
                stream: "all",
                component: "serializer",
            },
        }
    },
    traffics: [{
        latestRevision: true,
        percent: 100,
    }],
}, { dependsOn: [enableCloudRun, serializedTopic, registryService] });

const transformedSubscription = new gcp.pubsub.Subscription("serializer", {
    topic: transformedTopic.name,
    ackDeadlineSeconds: 20,
    labels: {
        stream: "all",
        component: "serializer",
    },
    pushConfig: {
        pushEndpoint: serializerService.status.url,
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
}, { dependsOn: [serializerService, deadLetterTopic] });

// Deploy serializer on cloud run. Modify max instances if needed (default 10).
const loaderService = new gcp.cloudrun.Service("loader", {
    location: `${region}`,
    template: {
        spec: {
            serviceAccountName: serviceAccountName,
            containers: [{
                envs: [
                    {
                        name: "REGISTRATOR_HOST",
                        value: registryService.status.url,
                    },
                ],
                image: `${artifactRegistryHostname}/streamprocessor-org/loader/bigquery-run-java:${loaderVersion}`,
            }],
        },
        metadata: {
            annotations: {
                "autoscaling.knative.dev/maxScale": "10"
            },
            labels: {
                stream: "all",
                component: "loader",
            },
        }
    },
    traffics: [{
        latestRevision: true,
        percent: 100,
    }],
}, { dependsOn: [enableCloudRun, serializedTopic, registryService] });



/* 
******** END BOOTSTRAP ********
*/


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