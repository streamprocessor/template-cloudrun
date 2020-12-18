import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import * as fs from 'fs';
import {GoogleAuth} from 'google-auth-library';
import {URL} from 'url';

const config = new pulumi.Config();
const serviceAccountName = config.require("serviceAccountName");

const gcpConfig = new pulumi.Config("gcp");
const region = gcpConfig.require("region");
const zone = gcpConfig.require("zone");
const project = gcpConfig.require("project");

const infra = new pulumi.StackReference("infra");
const deadLetterTopic = infra.getOutput("deadLetterTopic");
const transformedTopic = infra.getOutput("transformedTopic");
const collectedTopic = infra.getOutput("collectedTopic");
const serializedTopic = infra.getOutput("serializedTopic");
const registryService = infra.getOutput("registryService");
const loaderService = infra.getOutput("loaderService");

const artifactRegistryHostname = `${region}-docker.pkg.dev`;

/********* START SETTINGS *********/

const comGoogleAnalyticsV1EntityTransformerVersion = "0.1.5";
const bigQueryLocation = "EU";

//Array of comma separated property id:s
let properties = ["ua-xxxxx-y"];

/********* END SETTINGS *********/

function getServiceResponse(
    url: any = null,
    targetAudience: any = null
  ){
    const auth = new GoogleAuth();
  
    async function request() {
      if (!targetAudience) {
        // Use the request URL hostname as the target audience for requests.
        targetAudience = new URL(url).origin;
      }
      console.info(`request ${url} with target audience ${targetAudience}`);
      const client = await auth.getIdTokenClient(targetAudience);
      const res = await client.request({url});
      return JSON.stringify(res.data);
    }
  
    return request().catch(err => {
      console.error(err.message);
    });
}

function postSchemasToRegistry(
    url: any = null,
    targetAudience: any = null,
    folder='/schemas'
){
    const auth = new GoogleAuth();
    if (!targetAudience) {
        // Use the request URL hostname as the target audience for requests.
        targetAudience = new URL(url).origin;
      }
    fs.readdir(__dirname + folder, function (err, files) {
        if (err) {
        console.error("Could not list the directory.", err);
        process.exit(1);
        }
    
        files.forEach(async function (file, index) {
            if(file.endsWith('.avsc')){
                const avroString = fs.readFileSync(__dirname + folder + '/' + file, "utf8");
                console.info(`request ${url} with target audience ${targetAudience}`);
                const client = await auth.getIdTokenClient(targetAudience);
                const res = await client.request({
                    url: url,
                    method: 'POST',
                    body: avroString
                });
            }
        });
    });
}

/*
******** START com.google.analytics.v1 Shared Resources ********
*/


registryService["status"]["url"].apply(s => {
    console.log(s);
    postSchemasToRegistry(s+'/streams/versions' , null, '/schemas');
});

const comGoogleAnalyticsV1EntityTransformerService = new gcp.cloudrun.Service(
    "transformer-com-google-analytics-v1-entity",
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
                                value: transformedTopic["name"],
                            }
                        ],
                        image: `${artifactRegistryHostname}/streamprocessor-org/transformer/com-google-analytics-v1:${comGoogleAnalyticsV1EntityTransformerVersion}`,
                    }
                ],
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
        traffics: [
            {
                latestRevision: true,
                percent: 100,
            }
        ],
    }
);

const comGoogleAnalyticsV1EntityCollectedSubscription = new gcp.pubsub.Subscription(
    "com-google-analytics-v1-entity-transformer",
    {
        topic: collectedTopic["name"],
        ackDeadlineSeconds: 20,
        filter: "hasPrefix(attributes.stream, \"com.google.analytics.v1\")",
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
            deadLetterTopic: deadLetterTopic["id"]
        }
    },
    {
        dependsOn: [
            comGoogleAnalyticsV1EntityTransformerService
        ]
    }
);

const comGoogleAnalyticsV1EntityDataset = new gcp.bigquery.Dataset(
    "dataset-com-google-analytics-v1-entity",
    {
        datasetId: "com_google_analytics_v1",
        friendlyName: "com.google.analytics.v1",
        description: "Google Analytics v1 dataset.",
        location: bigQueryLocation,
        labels: {
            stream: "com-google-analytics-v1",
            component: "loader",
        },
    }
);  

/*
const comGoogleAnalyticsV1EntityTransformerInvoker = new gcp.cloudrun.IamMember("invoker-com-google-analytics-v1-entity-transformer", {
    location: comGoogleAnalyticsV1EntityTransformerService.location,
    project: comGoogleAnalyticsV1EntityTransformerService.project,
    service: comGoogleAnalyticsV1EntityTransformerService.name,
    role: "roles/run.invoker",
    member: `serviceAccount:${serviceAccountName}`,
});*/


/*
******** START property configuration ********
*/

for (let property of properties) {

    this[`${property}Schema`] = registryService["status"]["url"].apply(
        s => {
            return pulumi.output(getServiceResponse(`${s}/streams/com.google.analytics.v1.transformed.${property}.Entity/versions/latest/bigqueryschema` , null));
        }
    );
    
    this[`${property}Table`] = new gcp.bigquery.Table(`table-${property}`, {
        datasetId: comGoogleAnalyticsV1EntityDataset.datasetId,
        tableId: property.replace(/-/g, "_"),
        timePartitioning: {
            type: "DAY",
            field: "timestamp"
        },
        labels: {
            stream: "com-google-analytics-v1",
            component: "loader",
        },
        schema: this[property + 'Schema']
    });
    
    this[`${property}SerializedSubscriptionEndpoint`] = pulumi.all(
        [loaderService["status"]["url"], 
        this[`${property}Table`]]
    )
        .apply(([url, table]) => {
            return pulumi.output(pulumi.interpolate`${url}/project/${project}/dataset/${table.datasetId}/table/${table.tableId}`);
        }
    );
    
    this[`${property}SerializedSubscription`] = new gcp.pubsub.Subscription(
        `${property}-loader`,
        {
            topic: serializedTopic["name"],
            ackDeadlineSeconds: 20,
            filter: `attributes.stream=\"com.google.analytics.v1.transformed.${property}.Entity\"`,
            labels: {
                stream: "all",
                component: "loader",
            },
            pushConfig: {
                pushEndpoint: this[`${property}SerializedSubscriptionEndpoint`],
                attributes: {
                    "x-goog-version": "v1",
                },
                oidcToken: {
                    serviceAccountEmail: serviceAccountName
                }
            },
            deadLetterPolicy: {
                deadLetterTopic: deadLetterTopic["id"]
            }
        },
        {
            dependsOn: [
                this[`${property}Table`]
            ]
        }
    );
}