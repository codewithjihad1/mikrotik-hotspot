var vanzJ = {
        varName: function() {
            return this.textEdit;
          }
        }
        //WIFI NAME HERE
        var wifiName = {
          textEdit:"GamingHub",
        }
        //RUNNING BANNER TEXT HERE
        var runningText = {
          textEdit:"Welcome to Hezekiah GamingHub login portal&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;||&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<b>172.16.1.1</b>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;||&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Enjoy the unlimited data surfing, online gaming, streaming and downloading!&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;||&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Stay at home! Stay safe always.",
        }
        //INFO TEXT HERE
        var infoText = {
          textEdit:"For more info & queries please feel free to email munpasatiempo@gmail.com or you may contact cel.# 09517840238.",
        }
        //COPYRIGHT TEXT HERE
        var copyrightText = {
          textEdit:"Copyright &copy; 2021 Hezekiah GamingHub",
        }
        //POWERED BY TEXT HERE
        var pwrText = {
          textEdit:"Powered by Mikhmon",
        }

        var a = vanzJ.varName.call(wifiName); 
        document.getElementById("callwifiName").innerHTML = a;
        var b = vanzJ.varName.call(runningText); 
        document.getElementById("callrunningText").innerHTML = b;
        var c = vanzJ.varName.call(infoText); 
        document.getElementById("callinfoText").innerHTML = c;
        var d = vanzJ.varName.call(copyrightText); 
        document.getElementById("callcopyrightText").innerHTML = d;
        var e = vanzJ.varName.call(pwrText); 
        document.getElementById("callpwrText").innerHTML = e;