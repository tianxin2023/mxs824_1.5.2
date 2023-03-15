/* Copyright (C) 2018 - 2020 Dolphin Interconnect Solutions AS. All rights reserved */
function login(e){e.preventDefault();this.setAttribute("disabled","disabled");var t=this;var r=document.getElementById("usr").value;var n=document.getElementById("pwd").value;if(!r.length||!n.length){popup_error("Empty credentials","Please specify a username and password",1);t.removeAttribute("disabled");return}ajax({url:"/api/login",type:"POST",data:{username:r,password:n},success:function(e){t.removeAttribute("disabled");if(e.hasOwnProperty("token")){set_token(e.token);window.location.replace("/index.html")}else{popup_error("System error","Unknown authentication error: "+e,1)}},error:function(e,r){if(e.toString()[0]==="4"){popup_error("Authentication failed",r.hasOwnProperty("error")?r.error:"Unable to authenticate user",1)}else{popup_error("System error "+(r.hasOwnProperty("error")?r.error:r),"API may be unavailable.",1)}t.removeAttribute("disabled")}})}function main(){var e;var t;var r=document.getElementById("content").children;t=get_token();for(e=0;e<r.length;++e){if(r[e].nodeName==="DIV"){r[e].setAttribute("style","display: block;")}}ajax({url:"/api/status",headers:{Authorization:"bearer "+t},success:function(e,r){window.location.replace("/index.html")},error:function(e,r){if(e!=401){popup_error("Error: "+e,"Failed to load server configuration. API may be unavailable");return}if(t){delete_token()}if(r&&r.hasOwnProperty("serial")){ns_var_set("ns-serial",r.serial)}}});var n=document.getElementById("submit");n.removeAttribute("disabled");n.addEventListener("click",login)}