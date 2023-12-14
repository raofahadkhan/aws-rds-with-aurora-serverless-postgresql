import { APIGatewayProxyHandler } from "aws-lambda";
import { Client } from "pg";
import { SecretsManager } from "aws-sdk";

const secretsManager = new SecretsManager();

export const handler: APIGatewayProxyHandler = async () => {
	// Fetch the secret from Secrets Manager
	const secret = await secretsManager
		.getSecretValue({ SecretId: process.env.SECRET_ID! })
		.promise();

	const credentials = JSON.parse(secret.SecretString!);

	console.log(
		"host:",
		credentials.host,
		"port:",
		credentials.port,
		"user:",
		credentials.username,
		"password:",
		credentials.password,
		"database:",
		credentials.dbname
	);

	const client = new Client({
		host: credentials.host,
		port: credentials.port,
		user: credentials.username,
		password: credentials.password,
		database: credentials.dbname,
	});
	console.log("1");

	try {
		console.log("2");
		await client.connect();
		console.log("Connected to database");
		// COMPANY table
		await client.query(`
            CREATE TABLE IF NOT EXISTS COMPANY (
                COMPANY_ID UUID PRIMARY KEY,
                OWNER_ID VARCHAR(255),
                NAME VARCHAR(255),
                ADDRESS VARCHAR(255),
                ADDRESS2 VARCHAR(255),
                CITY VARCHAR(255),
                STATE VARCHAR(255),
                COUNTRY VARCHAR(255),
                ZIPCODE VARCHAR(255)
            );
        `);

		// USER table
		await client.query(`
            CREATE TABLE IF NOT EXISTS USERS (
                USER_ID UUID PRIMARY KEY,
                COMPANY_ID UUID REFERENCES company(COMPANY_ID),
                USER_NAME VARCHAR(255),
                SOURCE_USER_ID VARCHAR(255),
                IS_ACTIVE BOOLEAN,
                IS_MANAGER BOOLEAN,
                VIEW_PRICING BOOLEAN,
                PHONE_NUMBER VARCHAR(255)
            );
        `);

		// CLIENT table
		await client.query(`
            CREATE TABLE IF NOT EXISTS CLIENT (
                CLIENT_ID UUID PRIMARY KEY,
                COMPANY_ID UUID REFERENCES company(COMPANY_ID),
                FIRST_NAME VARCHAR(255),
                LAST_NAME VARCHAR(255),
                CLIENT_SINCE DATE,
                IS_ACTIVE BOOLEAN,
                CLIENT_CREATE_DATE DATE,
                SOURCE_CLIENT_ID VARCHAR(255)
            );
        `);
		// TAX_CODE table
		await client.query(`
        CREATE TABLE IF NOT EXISTS TAX_CODE (
            TAX_CODE_ID UUID PRIMARY KEY,
            COMPANY_ID UUID REFERENCES company(COMPANY_ID),
            TAX_CODE_NAME VARCHAR(255),
            TAX_CODE_DESCRIPTION VARCHAR(255),
            TAX_CODE_RATE DECIMAL(10, 2),
            IS_TAXABLE BOOLEAN
        );
        `);
		// SITE table
		await client.query(`
            CREATE TABLE IF NOT EXISTS SITE (
                SITE_ID UUID PRIMARY KEY,
                COMPANY_ID UUID REFERENCES company(COMPANY_ID),
                CLIENT_ID UUID REFERENCES client(CLIENT_ID),
                TAX_CODE_ID UUID REFERENCES tax_code(TAX_CODE_ID),
                ADDRESS VARCHAR(255),
                ADDRESS2 VARCHAR(255),
                CITY VARCHAR(255),
                STATE VARCHAR(255),
                COUNTRY VARCHAR(255),
                ZIPCODE VARCHAR(255),
                NOTES TEXT,
                SECURITY_NOTES TEXT,
                OFFICE_ALERT TEXT,
                COORDINATES VARCHAR(255),
                TECHNICIAN_NOTES TEXT
            );
        `);

		return {
			statusCode: 200,
			body: JSON.stringify({
				message: "Tables created or updated successfully!",
			}),
		};
	} catch (error: any) {
		console.error("Error:", error.message);
		return {
			statusCode: 500,
			body: JSON.stringify({ error: error.message }),
		};
	} finally {
		await client.end();
		console.log("Database connection closed");
	}
};
