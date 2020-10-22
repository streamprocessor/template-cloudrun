import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";

const config = new pulumi.Config();
const serviceAccountName = config.require("serviceAccountName");

const gcpConfig = new pulumi.Config("gcp");
const region = gcpConfig.require("region");
const zone = gcpConfig.require("zone");
const project = gcpConfig.require("project");

const artifactRegistryHostname = `${region}-docker.pkg.dev`;

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


// Create GCP PubSub topics
export const deadLetterTopic = new gcp.pubsub.Topic(
    "dead-letter", 
    {
        labels: {
            program: "infra",
            stream: "all",
            component: "dead-letter",
        },
        messageStoragePolicy: {
            allowedPersistenceRegions: [
                gcpConfig.require("region")
            ]
        }
    }
);

export const collectedTopic = new gcp.pubsub.Topic(
    "collected", 
    {
        labels: {
            program: "infra",
            stream: "all",
            component: "collector",
        },
        messageStoragePolicy: {
            allowedPersistenceRegions: [
                gcpConfig.require("region")
            ]
        }
    }
);

export const transformedTopic = new gcp.pubsub.Topic(
    "transformed", 
    {
        labels: {
            program: "infra",
            stream: "all",
            component: "transformer",
        },
        messageStoragePolicy: {
            allowedPersistenceRegions: [
                gcpConfig.require("region")
            ]
        }
    }
);

export const serializedTopic = new gcp.pubsub.Topic(
    "serialized", 
    {
        labels: {
            program: "infra",
            stream: "all",
            component: "serializer",
        },
        messageStoragePolicy: {
            allowedPersistenceRegions: [
                gcpConfig.require("region")
            ]
        }
    }
);

const encryptedTopic = new gcp.pubsub.Topic(
    "encrypted", 
    {
        labels: {
            program: "infra",
            stream: "all",
            component: "encryptor",
        },
        messageStoragePolicy: {
            allowedPersistenceRegions: [
                gcpConfig.require("region")
            ]
        }
    }
);

const processedTopic = new gcp.pubsub.Topic(
    "processed", 
    {
        labels: {
            program: "infra",
            stream: "all",
            component: "processed",
        },
        messageStoragePolicy: {
            allowedPersistenceRegions: [
                gcpConfig.require("region")
            ]
        }
    }
);

// Deploy collector on cloud functions and make public
const collectorFunction = new gcp.cloudfunctions.Function(
    "collector", 
    {
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
            program: "infra",
            stream: "all",
            component: "collector",
        },
    },
    { 
        dependsOn: [
            collectedTopic
        ] 
    }
);

const publicFunctionInvoker = new gcp.cloudfunctions.FunctionIamMember(
    "collector-iam-public-invoker", 
    {
        project: collectorFunction.project,
        region: collectorFunction.region,
        cloudFunction: collectorFunction.name,
        role: "roles/cloudfunctions.invoker",
        member: "allUsers",
    }, 
    { 
        dependsOn: collectorFunction 
    }
);

// Deploy registrator on cloud run. Modify max instances if needed (default 10).
export const registryService = new gcp.cloudrun.Service(
    "registrator", 
    {
        location: `${region}`,
        template: {
            spec: {
                serviceAccountName: serviceAccountName,
                containers: [
                    {
                        envs: [
                            {
                                name: "COMPATIBILITY",
                                value: "FORWARD",
                            },
                        ],
                        image: `${artifactRegistryHostname}/streamprocessor-org/registrator/cloud-run-java:${registratorVersion}`,
                    }
                ],
            },
            metadata: {
                annotations: {
                    "autoscaling.knative.dev/maxScale": "10"
                },
                labels: {
                    program: "infra",
                    stream: "all",
                    component: "registrator",
                },
            }
        },
        traffics: [
            {
                latestRevision: true,
                percent: 100,
            }
        ],
    });

// Deploy serializer on cloud run. Modify max instances if needed (default 10).
const serializerService = new gcp.cloudrun.Service(
    "serializer", 
    {
        location: `${region}`,
        template: {
            spec: {
                serviceAccountName: serviceAccountName,
                containers: [
                    {
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
                    }
                ],
            },
            metadata: {
                annotations: {
                    "autoscaling.knative.dev/maxScale": "10"
                },
                labels: {
                    program: "infra",
                    stream: "all",
                    component: "serializer",
                },
            }
        },
        traffics: [
            {
                latestRevision: true,
                percent: 100,
            }
        ],
    }, 
    { 
        dependsOn: [
            serializedTopic, 
            registryService
        ] 
    }
);

const transformedSubscription = new gcp.pubsub.Subscription(
    "transformedToSerializer", 
    {
        topic: transformedTopic.name,
        ackDeadlineSeconds: 20,
        labels: {
            program: "infra",
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
    }, 
    { 
        dependsOn: [
            serializerService, 
            deadLetterTopic
        ] 
    }
);

// Deploy serializer on cloud run. Modify max instances if needed (default 10).
export const loaderService = new gcp.cloudrun.Service(
    "loader", 
    {
        location: `${region}`,
        template: {
            spec: {
                serviceAccountName: serviceAccountName,
                containers: [
                    {
                        envs: [
                            {
                                name: "REGISTRATOR_HOST",
                                value: registryService.status.url,
                            },
                        ],
                        image: `${artifactRegistryHostname}/streamprocessor-org/loader/bigquery-run-java:${loaderVersion}`,
                    }
                ],
            },
            metadata: {
                annotations: {
                    "autoscaling.knative.dev/maxScale": "10"
                },
                labels: {
                    program: "infra",
                    stream: "all",
                    component: "loader",
                },
            }
        },
        traffics: [
            {
                latestRevision: true,
                percent: 100,
            }
        ],
    }, 
    { 
        dependsOn: [
            serializedTopic, 
            registryService
        ] 
    }
);