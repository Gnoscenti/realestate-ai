import baseConfig from "../vite.config";
export default (env: { command: "build" | "serve"; mode: string }) => {
  const resolved=typeof baseConfig==="function" ? baseConfig({...env,isSsrBuild:false,isPreview:false}) : baseConfig;
  return {...resolved,cacheDir:"tmp/auth-browser-cache",server:{port:8132,strictPort:true,host:"127.0.0.1",watch:{ignored:["**/tmp/**","**/test-results/**","**/playwright-report/**"]}}};
};
