This sample app demonstrate the features and functionality of the
[Unified UI Framework](https://github.com/wso2/carbon-uuf).

## How to deploy

1. Clone this repository. `git clone https://github.com/wso2-incubator/uuf-template-app.git`

2. Build the project with `mvn clean install`
  
   Make sure you have built the carbon-uuf  as a maven project before building this project. 
   Refer [Carbon-UUF](https://github.com/ChamNDeSilva/carbon-uuf/blob/master/README.md).

3. Extract`uuf-template-app.zip` generated in project target.

4. Copy the extracted `uuf-template-app` to the `<CARBON_PRODUCT_HOME>/repository/deployment/server/jaggeryapps/` 
   directory.
   
5. Navigate to https://localhost:9443/uuf-template-app/.