(function() {
    let objBrowser = chrome ? chrome : browser;

    //Get the blacklist domains option for the user
    objBrowser.runtime.sendMessage({func: "blacklist_domains"}, function(objResponse) {
        if(objResponse && objResponse.hasOwnProperty("resp")) {
            if(objResponse.resp == 1) {
                blacklistedDomainCheck();
            }
        }
    });

    //Detects if the current tab is in the blacklisted domains file
    function blacklistedDomainCheck() {
        let objBrowser = chrome ? chrome : browser;
        var arrBlacklistedDomains = [];
        var arrWhitelistedDomains = ["www.btcprivate.org", "btcprivate.org", "www.myetherwallet.com", "myetherwallet.com"];
        objBrowser.runtime.sendMessage({func: "blacklist_whitelist_domain_list"}, function (objResponse) {
            if (objResponse && objResponse.hasOwnProperty("resp")) {
                var objDomainLists = JSON.parse(objResponse.resp);
                var arrWhitelistedDomains = objDomainLists.whitelist;
                var arrBlacklistedDomains = objDomainLists.blacklist;
                return doBlacklistCheck(arrWhitelistedDomains, arrBlacklistedDomains);
            }
        });
    }

    function doBlacklistCheck(arrWhitelistedDomains, arrBlacklistedDomains)
    {
        //See if we are blocking all punycode domains.
        objBrowser.runtime.sendMessage({func: "block_punycode_domains"}, function(objResponse) {
            if(objResponse && objResponse.hasOwnProperty("resp")) {
                var strCurrentTab = window.location.hostname;
                var strCurrentTab = strCurrentTab.replace(/www\./g,'');

                if(objResponse.resp == 1) {
                    var arrDomainParts = strCurrentTab.split(".");
                    arrDomainParts.forEach(strDomainPart => {
                        if (strDomainPart.startsWith("xn--")) {
                            window.location.href = "https://harrydenley.com/EtherAddressLookup/phishing.html#" + (window.location.href) + "#punycode";
                            return false;
                        }
                    });
                }
            }
        });

        //Domain is whitelisted, don't check the blacklist.
        var strCurrentTab = window.location.hostname;
        strCurrentTab = strCurrentTab.replace(/www\./g,'');
        if(arrWhitelistedDomains.indexOf(strCurrentTab) >= 0) {
            console.log("Domain "+ strCurrentTab +" is whitelisted on BTCPAL!");
            return false;
        }

        if(arrBlacklistedDomains.length > 0) {
            var isBlacklisted = arrBlacklistedDomains.indexOf(strCurrentTab) >= 0 ? true : false;

            //Only do Levenshtein if it's not blacklisted
            //Levenshtein - @sogoiii
            var blHolisticStatus = false;
            if(isBlacklisted === false && arrWhitelistedDomains.indexOf(strCurrentTab) < 0) {
                var strCurrentTab = punycode.toUnicode(strCurrentTab);
                var source = strCurrentTab.replace(/\./g, '');
                var intHolisticMetric = levenshtein(source, 'btcprivate');
                var intHolisticLimit = 5; // How different can the word be?
                blHolisticStatus = (intHolisticMetric > 0 && intHolisticMetric < intHolisticLimit) ? true : false;
                var intHolisticMetric2 = levenshtein(source, 'myetherwallet');
                var intHolisticLimit2 = 5; // How different can the word be?
                blHolisticStatus2 = (intHolisticMetric > 0 && intHolisticMetric < intHolisticLimit) ? true : false;
                if(blHolisticStatus === false || blHolisticStatus2 === false) {
                    //Do edit distance against mycrypto
                    var intHolisticMetric = levenshtein(source, 'mycrypto');
                    blHolisticStatus = (intHolisticMetric > 0 && intHolisticMetric < 3) ? true : false;
                }
            }

            //If it's not in the whitelist and it is blacklisted or levenshtien wants to blacklist it.
            if ( arrWhitelistedDomains.indexOf(strCurrentTab) < 0 && (isBlacklisted === true || blHolisticStatus === true || blHolisticStatus2 === true)) {
                console.warn(window.location.href + " is blacklisted by BTCPAL - "+ (isBlacklisted ? "Blacklisted" : "Levenshtein Logic"));
                window.location.href = "https://harrydenley.com/EtherAddressLookup/phishing.html#"+ (window.location.href) +"#"+ (isBlacklisted ? "blacklisted" : "levenshtein");
                return false;
            }
        }

        //Now do the 3rd party domain list check if they have that option enabled.
        objBrowser.runtime.sendMessage({func: "3rd_party_blacklist_domains"}, function(objResponse) {
            if(objResponse && objResponse.hasOwnProperty("resp")) {
                if(objResponse.resp == 1) {
                    objBrowser.runtime.sendMessage({func: "3p_blacklist_domain_list"}, function(objResponse) {
                        if(objResponse && objResponse.hasOwnProperty("resp")) {
                            var obj3rdPartyLists = JSON.parse(objResponse.resp);
                            var strCurrentTab = window.location.hostname;
                            var strCurrentTab = strCurrentTab.replace(/www\./g,'');

                            for(var str3rdPartyIdentifier in obj3rdPartyLists) {

                                if(obj3rdPartyLists[str3rdPartyIdentifier].format == "sha256") {
                                    strCurrentTab = sha256(strCurrentTab);
                                }

                                if(obj3rdPartyLists[str3rdPartyIdentifier].domains.indexOf(strCurrentTab) >= 0) {
                                    console.warn(window.location.href + " is blacklisted by "+ str3rdPartyIdentifier);
                                    window.location.href = "https://harrydenley.com/EtherAddressLookup/phishing-"+ str3rdPartyIdentifier +".html#"+ (window.location.href);
                                    return false;
                                }
                            }
                        }
                    });
                }
            }
        });
    }

    function levenshtein(a, b) {
        if(a.length == 0) return b.length;
        if(b.length == 0) return a.length;

        // swap to save some memory O(min(a,b)) instead of O(a)
        if(a.length > b.length) {
            var tmp = a;
            a = b;
            b = tmp;
        }

        var row = [];
        // init the row
        for(var i = 0; i <= a.length; i++){
            row[i] = i;
        }

        // fill in the rest
        for(var i = 1; i <= b.length; i++){
            var prev = i;
            for(var j = 1; j <= a.length; j++){
                var val;
                if(b.charAt(i-1) == a.charAt(j-1)){
                    val = row[j-1]; // match
                } else {
                    val = Math.min(row[j-1] + 1, // substitution
                        prev + 1,     // insertion
                        row[j] + 1);  // deletion
                }
                row[j - 1] = prev;
                prev = val;
            }
            row[a.length] = prev;
        }

        return row[a.length];
    }
})();
