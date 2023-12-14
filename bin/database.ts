#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { DatabaseStack } from "../lib/database-stack";

const service = "database";
let stage;
const app = new cdk.App();

stage = "m";
new DatabaseStack(app, `${service}-${stage}`, {
	tags: {
		service,
		stage,
	},
});

stage = "d";
new DatabaseStack(app, `${service}-${stage}`, {
	tags: {
		service,
		stage,
	},
});
