import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as rds from "aws-cdk-lib/aws-rds";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ec2 from "aws-cdk-lib/aws-ec2";

export class DatabaseStack extends cdk.Stack {
	constructor(scope: Construct, id: string, props?: cdk.StackProps) {
		super(scope, id, props);
		const { service, stage } = props?.tags!;

		//=============================================================
		// Creating a vpc
		//=============================================================
		const vpc = new ec2.Vpc(this, `${service}-${stage}-vpc`);

		vpc.addInterfaceEndpoint(`${service}-${stage}-interface`, {
			service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
		});

		/* RDS Data API Endpoint */
		vpc.addInterfaceEndpoint(`${service}-${stage}-rds_data`, {
			service: ec2.InterfaceVpcEndpointAwsService.RDS_DATA,
		});

		const auroraSecurityGroup = new ec2.SecurityGroup(
			this,
			`${service}-${stage}-aurora-sg`,
			{
				vpc: vpc,
				description: "Aurora security group",
				allowAllOutbound: true,
			}
		);

		// Allow all inbound traffic to Aurora
		auroraSecurityGroup.addIngressRule(
			ec2.Peer.anyIpv4(),
			ec2.Port.tcp(5432),
			"Allow all access to PostgreSQL"
		);

		// ===========================================================================
		// RDS ServerlessCluster : Create the serverless cluster,
		// provide all values needed to customise the database.
		// ===========================================================================
		const auroraServerlessCluster = new rds.ServerlessCluster(
			this,
			`${service}-${stage}-aurora-serverless-cluster`,
			{
				engine: rds.DatabaseClusterEngine.auroraPostgres({
					version: rds.AuroraPostgresEngineVersion.VER_13_4,
				}),
				clusterIdentifier: `${service}-${stage}-aurora-serverless-cluster`,
				defaultDatabaseName: "servercommandrds",
				vpc: vpc,
				credentials: rds.Credentials.fromGeneratedSecret(
					"dbadminuser",
					{
						secretName: "aurora-cluster-secret",
					}
				),
				enableDataApi: true,
				scaling: {
					autoPause: cdk.Duration.minutes(10),
					minCapacity: rds.AuroraCapacityUnit.ACU_8,
					maxCapacity: rds.AuroraCapacityUnit.ACU_32,
				},
			}
		);

		// ===========================================================================
		// Lambda : Function to create resources for aurora serverless cluster
		// ===========================================================================
		const clusterResourcesLambda = new lambda.Function(
			this,
			`${service}-${stage}-cluster-resources-lambda`,
			{
				functionName: `${service}-${stage}-cluster-resources-lambda`,
				runtime: lambda.Runtime.NODEJS_16_X,
				code: lambda.Code.fromAsset("lambda"),
				handler: "ClusterResourcesLambda.handler",
				environment: {
					SECRET_ID: auroraServerlessCluster.secret?.secretName || "",
					CLUSTER_ARN: auroraServerlessCluster.clusterArn,
				},
				timeout: cdk.Duration.minutes(5),
				retryAttempts: 2,
				vpc: vpc,
			}
		);
		// Add Security Group modifications here:
		const lambdaSecurityGroup =
			clusterResourcesLambda.connections.securityGroups[0];
		auroraServerlessCluster.connections.allowFrom(
			lambdaSecurityGroup,
			ec2.Port.tcp(5432)
		);
		lambdaSecurityGroup.connections.allowTo(
			auroraServerlessCluster,
			ec2.Port.tcp(5432)
		);

		// ===========================================================================
		// Permission : Give `clusterResourcesLambda` Lambda permission
		// to access `clusterSecret` secret
		// ===========================================================================
		auroraServerlessCluster.secret?.grantRead(clusterResourcesLambda);

		// ===========================================================================
		// Permission : Give `clusterResourcesLambda` Lambda permission
		// to access `auroraServerlessCluster` rds cluster
		// ===========================================================================
		auroraServerlessCluster.grantDataApiAccess(clusterResourcesLambda);

		// Create a new IAM User
		const queryEditorUser = new iam.User(
			this,
			`${service}-${stage}-query-editor-user`,
			{
				userName: "RDSQueryEditorUser",
			}
		);

		// Grant permissions to access Secrets Manager for the RDS cluster secret
		queryEditorUser.addToPolicy(
			new iam.PolicyStatement({
				actions: [
					"secretsmanager:GetSecretValue",
					"secretsmanager:DescribeSecret",
				],
				resources: [auroraServerlessCluster.secret!.secretArn],
			})
		);

		// Grant permissions to access RDS Data API
		queryEditorUser.addToPolicy(
			new iam.PolicyStatement({
				actions: ["rds-data:ExecuteStatement"],
				resources: [auroraServerlessCluster.clusterArn],
			})
		);

		//==============================================
		// Output Values
		//==============================================

		new cdk.CfnOutput(this, `${service}-${stage}-cluster-arn--output`, {
			value: auroraServerlessCluster.clusterArn,
			description: "The ARN of the Aurora Serverless Cluster",
			exportName: "ClusterArn",
		});

		new cdk.CfnOutput(this, `${service}-${stage}-cluster-endpoint-output`, {
			value: auroraServerlessCluster.clusterEndpoint.hostname,
			description: "The endpoint of the Aurora Serverless Cluster",
			exportName: "ClusterEndpoint",
		});

		new cdk.CfnOutput(this, `${service}-${stage}-cluster-secret-output`, {
			value: auroraServerlessCluster.secret?.secretArn || "No Secret",
			description:
				"The ARN of the secret associated with the Aurora Serverless Cluster",
			exportName: "ClusterSecret",
		});
	}
}
