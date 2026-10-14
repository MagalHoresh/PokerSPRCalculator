targetScope = 'subscription'

@minLength(1)
@maxLength(64)
param environmentName string

@minLength(1)
param location string

param sessionId string

param deployedBy string

param createdAt string

param resourceGroupName string

param staticWebAppName string

var tags = {
  'app-onboard-skill': 'true'
  'app-onboard-session-id': sessionId
  'created-at': createdAt
  environment: environmentName
  'deployed-by': deployedBy
}

resource rg 'Microsoft.Resources/resourceGroups@2023-07-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

module staticSite './modules/static-site.bicep' = {
  name: 'static-site'
  scope: rg
  params: {
    location: location
    staticWebAppName: staticWebAppName
    tags: tags
  }
}
