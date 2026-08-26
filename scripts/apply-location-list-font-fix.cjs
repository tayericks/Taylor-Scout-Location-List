const fs=require('fs');
const cssPath='src/styles.css';
let css=fs.readFileSync(cssPath,'utf8');
const marker='/* location-list-unified-font-fix */';
const block=`${marker}
html,body,#root,.suite-shell,.suite-main,.tracker-page,.tracker-table,.table-wrap,table,thead,tbody,tr,th,td,button,input,select,textarea,label,span,small,strong,b,p,h1,h2,h3,h4,h5,h6{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important}
.table-wrap table,.table-wrap th,.table-wrap td,.table-wrap button,.table-wrap input,.table-wrap select,.table-wrap textarea,.table-wrap .name,.table-wrap small{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important}
.name{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;font-style:normal!important}
@media print{.cols p,.cols pre,.support{font-family:Arial,sans-serif!important}}
`;
const i=css.indexOf(marker);
if(i>=0)css=css.slice(0,i)+block;else css+='\n'+block;
fs.writeFileSync(cssPath,css);
console.log('Applied unified Location List font');
