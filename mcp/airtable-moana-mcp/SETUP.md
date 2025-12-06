# Airtable Moana MCP - Setup Guide

Complete guide to set up and use the Airtable Moana MCP server with Claude Desktop.

## Overview

This MCP server has been updated to support all 12 fields in the Airtable Listings table, including the 4 new optional fields:
- Prix (Price in EUR)
- Prix précédent (Previous price in EUR)
- Dernier message (Last message - max 500 chars)
- Commentaire (Comment - max 2000 chars)

## Prerequisites

- Node.js 18.0.0 or higher
- npm
- Claude Desktop application
- Access to Moana Yachting Airtable base

## Step 1: Install Dependencies

```bash
cd C:\Users\beatr\Documents\projets\moana\mcp\airtable-moana-mcp
npm install
```

## Step 2: Build the MCP Server

```bash
npm run build
```

This will compile the TypeScript code to JavaScript in the `dist/` folder.

## Step 3: Verify Build

Check that the following file exists:
```
C:\Users\beatr\Documents\projets\moana\mcp\airtable-moana-mcp\dist\index.js
```

## Step 4: Configure Claude Desktop

### Option A: Add to existing .mcp.json

If you already have a `.mcp.json` file, add the Airtable Moana MCP configuration:

1. Open your `.mcp.json` file (usually in your home directory or Claude config folder)
2. Add this configuration to the `mcpServers` object:

```json
{
  "mcpServers": {
    "Airtable Moana MCP": {
      "command": "node",
      "args": [
        "C:/Users/beatr/Documents/projets/moana/mcp/airtable-moana-mcp/dist/index.js"
      ],
      "env": {
        "AIRTABLE_API_KEY": "your_airtable_personal_access_token_here",
        "AIRTABLE_BASE_ID": "appNyZVynxa8shk4c",
        "AIRTABLE_LISTINGS_TABLE_ID": "tblxxQhUvQd2Haztz",
        "AIRTABLE_BROKER_TABLE_ID": "tbl9dTwK6RfutmqVY"
      }
    }
  }
}
```

### Option B: Use the provided configuration file

Copy the content from `mcp-config.json` to your Claude Desktop configuration.

## Step 5: Restart Claude Desktop

After adding the MCP configuration, restart Claude Desktop for the changes to take effect.

## Step 6: Verify MCP Server is Running

In Claude Desktop, you should see the MCP server listed as "Airtable Moana MCP" in your available tools.

You can test it by asking Claude:
```
List all available MCP tools
```

You should see 7 tools:
1. list_listings
2. get_listing
3. create_listing
4. update_listing
5. delete_listing
6. list_brokers
7. authenticate_broker

## Step 7: Test the MCP Server

Try these commands in Claude Desktop:

### List all boats
```
Use the MCP to list all boats in the Moana Yachting catalog
```

### Get a specific boat
```
Get details for boat with ID recXXXXXXXXXXXXXX
```

### Create a new boat with all fields
```
Create a new boat listing with:
- Name: Test Yacht
- Builder: Sunseeker
- Length: 25.5
- Year: 2023
- Owner: John Doe
- Captain: Captain Smith
- Broker: john.doe
- Location: Monaco
- Price: 3000000
- Previous Price: 3200000
- Last Message: New listing
- Comment: Beautiful yacht in excellent condition
```

### Update a boat
```
Update boat recXXXXXXXXXXXXXX to change the price to 2800000 and add a comment "Price reduced for quick sale"
```

## Troubleshooting

### MCP Server Not Showing Up

1. Check that the build was successful:
   ```bash
   ls C:\Users\beatr\Documents\projets\moana\mcp\airtable-moana-mcp\dist\index.js
   ```

2. Verify the path in `.mcp.json` is correct (use forward slashes)

3. Check Claude Desktop logs for any errors

### Connection Errors

1. Verify the Airtable API key is correct
2. Check internet connection
3. Verify the Base ID and Table IDs are correct

### Field Errors

If you get errors about missing fields:

1. Verify all 12 fields exist in Airtable:
   - 8 required fields
   - 4 optional fields (Prix, Prix précédent, Dernier message, Commentaire)

2. Check that field names match exactly (including accents and spaces)

3. Verify "Localisation" field type is "Single line text" (not "Single select")

### Permission Errors

Make sure your Airtable API key has:
- Read access to both tables
- Write access to Listings table
- Read access to Broker table

## Development Mode

To run the MCP server in development mode with auto-reload:

```bash
npm run dev
```

This will watch for file changes and recompile automatically.

## Updating the MCP Server

If you make changes to the code:

1. Stop Claude Desktop
2. Rebuild the MCP server:
   ```bash
   npm run build
   ```
3. Restart Claude Desktop

## Field Validation

The MCP server validates all inputs:

- **Dernier message**: Max 500 characters
- **Commentaire**: Max 2000 characters
- **Prix** and **Prix précédent**: Must be positive numbers
- **Année**: Must be between 1900 and current year + 1
- **Longueur**: Must be a positive number

## Security Notes

- API keys are stored in the MCP configuration file
- Passwords are transmitted in plain text (consider implementing bcrypt)
- The Broker authentication tool compares plain text passwords
- Consider implementing rate limiting in production

## Next Steps

Once the MCP server is running:

1. Test all CRUD operations
2. Verify the new optional fields are working
3. Test filtering and search functionality
4. Integrate with the Next.js application
5. Consider adding more sophisticated error handling

## Support

For issues or questions:
- Check the README.md for tool documentation
- Review the TypeScript types in `src/types/index.ts`
- Check the CLAUDE.md in the project root for full project documentation

## License

MIT
